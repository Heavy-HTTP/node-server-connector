import { X_HEAVY_HTTP_ACTION, X_HEAVY_HTTP_ACTIONS, X_HEAVY_HTTP_ID,HEAVY_RESPONSE } from "./constant";
import { IncomingMessage, ServerResponse } from "http";
const transformerProxy = require("transformer-proxy");
const crypto = require("crypto");


interface ConnectorConfig {
    responseSize: number
}

interface PayloadResponse {
    contentLength: string,
    contentType: string,
    content: Buffer
}


interface Transporter {
    generateUploadURL: (id: string) => Promise<string>,
    deletePaylod: (id: string) => Promise<void>,
    getPaylod: (id: string) => Promise<PayloadResponse>,
    uploadPayload: (id: string, content: Buffer, contentType: string | null) => Promise<void>,
    generateDownloadURL: (id: string) => Promise<string>,
}



export const connector = (connectorConfig: ConnectorConfig, transporter: Transporter, silentErrorHandler?: (error: Error) => void): any => {

    if (connectorConfig.responseSize < 0) {
        throw new Error("Response Size must be a non-negative value")
    }

    function retriveHeavyHttpId(heavyHttpId: string | string[] | undefined) {
        if (typeof heavyHttpId === 'string') {
            return heavyHttpId
        }
        throw new Error(`Invalid Heavy HTTP Request Id: ${heavyHttpId}`);
    }

    function silentErrorHanlderWrapper(error:Error){
        if (typeof silentErrorHandler === "function") {
            silentErrorHandler(error);
        } else {
            console.error(error);
        }
    }



    return {
        responseHandler: transformerProxy(async function (responseData: any, req: IncomingMessage, res: ServerResponse) {
            try {
                if (Buffer.byteLength(responseData) > connectorConfig.responseSize) {

                    const heavyHTTPId = crypto.randomBytes(4).toString('hex');
                    await transporter.uploadPayload(heavyHTTPId, Buffer.from(responseData), res.getHeader('content-type')?.toString() || null);
                    const signedURL = await transporter.generateDownloadURL(heavyHTTPId);
                    if (!res.headersSent) {
                        res.setHeader(X_HEAVY_HTTP_ACTION, X_HEAVY_HTTP_ACTIONS.DOWNLOAD)
                        res.setHeader(X_HEAVY_HTTP_ID, heavyHTTPId);
                    }
                    return `${HEAVY_RESPONSE}|${heavyHTTPId}|${signedURL}`;
                }
            } catch (error) {
                silentErrorHanlderWrapper(new Error("Heavy HTTP Response Failed, caused by: " + (error as Error).stack + "\n"))
            }
            return responseData;
        }),

        requestHandler: async function (req: IncomingMessage, res: ServerResponse, next: (err?: any) => any) {

            try {
                if (X_HEAVY_HTTP_ACTION in req.headers) {


                    if (req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.INIT) {
                        const uniqueId = retriveHeavyHttpId(req.headers[X_HEAVY_HTTP_ID]);
                        const responseText = await transporter.generateUploadURL(uniqueId);
                        res.write(responseText);
                        return res.end();

                    }

                    if (req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.SEND_ERROR) {
                        const uniqueId = retriveHeavyHttpId(req.headers[X_HEAVY_HTTP_ID]);
                        await transporter.deletePaylod(uniqueId);
                        res.writeHead(500, 'Heavy HTTP Request Failed');
                        return res.end();

                    }

                    if (req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.DOWNLOAD_END) {
                        const uniqueId = retriveHeavyHttpId(req.headers[X_HEAVY_HTTP_ID]);
                        try{
                            await transporter.deletePaylod(uniqueId);
                        }catch(error){
                            silentErrorHanlderWrapper(new Error("Heavy HTTP Response Failed, caused by: " + (error as Error).stack + "\n"))
                        }
                    
                        res.writeHead(200, 'Heavy HTTP Response Completed');
                        return res.end();


                    }

                    if (req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.SEND_ABORT || req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.DOWNLOAD_ABORT) {
                        const uniqueId = retriveHeavyHttpId(req.headers[X_HEAVY_HTTP_ID]);
                        try{
                            await transporter.deletePaylod(uniqueId);
                        }catch(error){
                            silentErrorHanlderWrapper(new Error("Heavy HTTP Process Failed, caused by: " + (error as Error).stack + "\n"))
                        }
                    
                        res.writeHead(200, 'Heavy HTTP Process Aborted');
                        return res.end();
                    }

                    if (req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.SEND_SUCCESS) {

                        const uniqueId = retriveHeavyHttpId(req.headers[X_HEAVY_HTTP_ID]);

                        const emitter = req.emit

                        const item = await transporter.getPaylod(uniqueId);

                        await transporter.deletePaylod(uniqueId);

                        req.headers['content-length'] = item.contentLength;

                        req.headers['content-type'] = item.contentType;

                        for (let i = 0; i < req.rawHeaders.length; i++) {
                            if (req.rawHeaders[i]?.toLowerCase() === 'content-length') {
                                req.rawHeaders[i + 1] = item.contentLength;
                            }

                            if (req.rawHeaders[i]?.toLowerCase() === 'content-type') {
                                req.rawHeaders[i + 1] = item.contentType;
                            }
                        }

                        req.emit = (eventName: string, ...data: any) => {
                            if (eventName === 'data') {
                                return emitter.apply(req, [eventName, item.content])
                            }
                            return emitter.apply(req, [eventName, ...data])

                        }

                    }else {
                        throw new Error(`Invalid Heavy HTTP Request Action: ${req.headers[X_HEAVY_HTTP_ACTION]}`);
                    }

                }
                next();
            } catch (e) {
                next(new Error("Heavy HTTP Request Failed, caused by: " + (e as Error).stack + "\n"));
            }

        }
    }
}
