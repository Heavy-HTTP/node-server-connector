# Node Server Connector

This library is part of the Heavy HTTP project. If you are new to Heavy HTTP it is recommended to go through the [Heavy HTTP documentation](https://github.com/Heavy-HTTP/.github/blob/main/profile/Readme.md) first. 

Node Server Connector is the Heavy HTTP Server Connector for Node JS servers. It's responsible for handling all the Heavy HTTP traffic in Node JS applications. Since the connector is written as multiple middlewares those can be easily attached to an existing application. The library modifies certain core methods of the Node HTTP request-response module to support the enhanced communication protocol. With this implementation Node Server Connector is fully compatible with all existing Node Js web server frameworks with zero modifications.

To learn more about the full communication protocol please refer to [Heavy HTTP Communication Protocol](https://github.com/Heavy-HTTP/.github/blob/main/profile/Readme.md#heavy-http-communication-protocol).


### Looking under the hood 
When receiving the request from HTTP Client, the Node Server Connector performs the following operations
1. Identify whether the request is a Heavy Request or not (Based on request headers). 
2. If it's a Heavy Request shift to the Heavy Http Transporter to fetch the request data. Otherwise, proceed with the existing communication pattern. 
3. Provide the seamless experience of the HTTP request to the runtime APIs. 

When sending the response to HTTP Client, Node Server Connector performs the following operations
1. Identify the type of the payload and estimate the size of the payload.
2. If the size of the payload is beyond the configured threshold shift to the Heavy HTTP Transporter to continue the communication. If not proceed with the existing communication pattern. 
3. Provide the seamless experience of HTTP response to the HTTP Client. (If the response is a heavy response, then the HTTP Client must be a Heavy HTTP Client to understand the protocol). 


### Node Server Connector Implementation

* Usage of Node Server Connector in an Express App.
	```
	const express = require('express')
	const cors = require('cors');

	const heavyHttp = require('@heavy-http/node-server-connector');
	const s3Transporter = require('./s3-transporter');

	const app = express()
	const port = 3010

	app.use(cors({
	  origin: 'http://localhost:3000',
	  exposedHeaders: ['x-heavy-http-action', 'x-heavy-http-id']
	}));

	const { requestHandler, responseHandler } = heavyHttp.connector({ responseThreshold: 1 }, s3Transporter('bucket-name', 3600))

	app.use(requestHandler);
	app.use(responseHandler);
	app.use(express.text({ inflate: true }))
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }))

	app.post('/test', async (req, res) => {
	  console.log('request body',req.body)
	  res.write('content')
	  res.write('||more content||')
	  res.end('final content');
	})

	app.listen(port, () => {
	  console.log(`Example app listening on port ${port}`)
	})

	```

* CORS\
    Heavy HTTP communication is based on *x-heavy-http-action* and *x-heavy-http-id* headers in the request and response. Hence if the server communicates with browsers those headers need to be configured in CORS. 

* Heavy-HTTP Connector\
    Heavy HTTP connector takes the following inputs in order to generate the middlewares

    * ConnectorConfig [Required]\
        All the configurations related to Connector are mentioned here.
        ```responseThreshold``` is the maximum response body size (in bytes) that can be communicated via default HTTP channels. This value must a positive integer and depends on the architecture of the application

    * Transporter [Required]\
        Storage layer hook for the connector. The interface of Transporter is as follows. 
        ```
        interface Payload {
            contentLength: string,
            contentType: string,
            content: Buffer
        }


        interface Transporter {
            generateUploadURL: (id: string) => Promise<string>,
            terminate: (id: string, terminationCode:string) => Promise<void>,
            injectHeavyRequestBody: (id: string) => Promise<Payload>,
            handleHeavyResponseBody: (id: string, content: Buffer
            contentType: string | null) => Promise<string>,
        }
        ```
        The Transporter must be implemented by the developer. Before the implementation, it's recommended to go through the [Heavy-HTTP/transporters](https://github.com/Heavy-HTTP/transporters#readme) repository to grasp the concept of the Transporter.

        There are already implemented transporters in the [Heavy-HTTP/transporters](https://github.com/Heavy-HTTP/transporters) repository. If they suit the developer's purpose developer can use them as well. 

    * SilentErrorHandler [Optional]\
        When there are multiple HTTP requests there can be multiple failures as well. With Heavy HTTP, not all failures are catastrophic for the request/response life cycle. So in case of exception Node Server Connector would not break the flow unless it is absolutely required. The non-breaking failures are known as silent failures. By default Node Server Connector logs the issue to the standard output buffer and continues. But if the developer wants to perform some action (ex: Logging) on those silent failures the SilentErrorHandler is the key to that. The SilentErrorHandler is function with the  signature of  ```(error: Error) => void)```. The following failures would be considered as silent failures.
        1. Failures in response download complete confirmation.
        2. Failures in a response signed URL generation (Orignal response will be sent to the client).
        3. Failures in acknowledgment of response or request aborts.


* Middlewares\
    heavyHttp.connector creates two middlewares, *requestHandler* and *responseHandler*.

    * requestHandler\
        This middleware takes care of the request related communications in the Heavy HTTP. Identifying the heavy HTTP requests and handling them is the main responsibility of the *requestHandler* middleware.

    * responseHandler\
        This middleware takes care of the response related communications in the Heavy HTTP. Identifying the heavy HTTP responses and handling them is the main responsibility of the *responseHandler* middleware.

    It is not mandatory to attach both middlewares. But usage of one middleware would be highly unlikely.  When attaching those middlewares the recommended approach is to attach them at the beginning of the middleware chain right after the CORS. If there are any body-parsing middlewares Heavy HTTP middlewares must be attached before them. Attaching them at the top makes sense because the components which handle the business logic shouldn't be aware of the existence of the HTTP at all. 

### Cookies and Status Codes
Setting cookies with response headers is fairly common in modern applications. Controlling the behavior of browsers with the response status codes is also used by most applications. Even though Node Server Connector uses multiple HTTP requests to send the response it wouldn't change any of the existing behaviors. So cookies and status codes will be delivered to the client without any issues. 