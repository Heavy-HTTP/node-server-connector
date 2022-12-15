import { connector } from '../index';
import { X_HEAVY_HTTP_ACTION, X_HEAVY_HTTP_ACTIONS, X_HEAVY_HTTP_ID, HEAVY_RESPONSE } from "../constant";
import * as transformerProxy from 'transformer-proxy';
import * as crypto from 'crypto';

jest.mock('transformer-proxy');

const mockedDependency = <jest.Mock<typeof transformerProxy>>transformerProxy;

beforeEach(() => {
  jest.spyOn(crypto, 'randomBytes').mockImplementation(() => '222222');
});

describe('connector test suite ', () => {

  test('connector fails with negative response size', () => {
    const transporter: any = {}
    expect(() => connector({ responseSize: -1 }, transporter)).toThrow(Error("Response Size must be a non-negative value"));
  });
})


describe('connector-response handler test suite ', () => {

  test('response is not modified when size is below the defined response size', async () => {
    mockedDependency.mockImplementationOnce(fn => fn)
    let isExecuted = false;
    const transporter: any = {
      uploadPayload: () => {
        isExecuted = true;
      }
    }
    const request: any = {}
    const response: any = {}
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    expect(await responseHandler("111111", request, response)).toBe("111111");
    expect(isExecuted).toBe(false)
  });

  test('response is modified when size is above the defined response size without headers sent', async () => {
    mockedDependency.mockImplementationOnce(fn => fn)
    let isExecuted = false;
    const transporter: any = {
      generateDownloadURL: async () => {
        return 'testURL'
      },
      uploadPayload: async () => {
        isExecuted = true;
      }
    }

    const headersList: any[] = []
    const request: any = {}
    const response: any = {
      headersSent: false,
      setHeader: (header: any, value: any) => { headersList.push({ header, value }) },
      getHeader: () => 'ABCS'
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 1 }, transporter)
    expect(await responseHandler("111111", request, response)).toBe(`${HEAVY_RESPONSE}|222222|testURL`);
    expect(isExecuted).toBe(true)
    expect(headersList).toStrictEqual([
      { header: 'x-heavy-http-action', value: 'download' },
      { header: 'x-heavy-http-id', value: '222222' }
    ])
  });

  test('response is modified when size is above the defined response size with headers already sent', async () => {

    mockedDependency.mockImplementationOnce(fn => fn)
    let isExecuted = false;
    const transporter: any = {
      generateDownloadURL: async () => {
        return 'testURL'
      },
      uploadPayload: async () => {
        isExecuted = true;
      }
    }

    const headersList: any[] = []
    const request: any = {}
    const response: any = {
      headersSent: true,
      setHeader: (header: any, value: any) => { headersList.push({ header, value }) },
      getHeader: () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 1 }, transporter)
    expect(await responseHandler("111111", request, response)).toBe(`${HEAVY_RESPONSE}|222222|testURL`);
    expect(isExecuted).toBe(true)
    expect(headersList).toStrictEqual([])
  });

  test('response modification failure and no error function is defined', async () => {
    let errorData: any = null;
    console.error = jest.fn().mockImplementation(error => errorData = error);
    mockedDependency.mockImplementationOnce(fn => fn)
    let isExecuted = false;
    const transporter: any = {
      generateDownloadURL: async () => {
        throw new Error('Mock Failed')
      },
      uploadPayload: async () => {
        isExecuted = true;
      }
    }

    const headersList: any[] = []
    const request: any = {}
    const response: any = {
      headersSent: true,
      setHeader: (header: any, value: any) => { headersList.push({ header, value }) },
      getHeader: () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 1 }, transporter)
    expect(await responseHandler("111111", request, response)).toBe("111111");
    expect(isExecuted).toBe(true)
    expect(headersList).toStrictEqual([])
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(errorData).toBeInstanceOf(Error)
  });



  test('response modification failure and error function is defined', async () => {
    let errorData: any = null;
    console.error = jest.fn();
    mockedDependency.mockImplementationOnce(fn => fn)
    let isExecuted = false;
    const transporter: any = {
      generateDownloadURL: async () => {
        throw new Error('Mock Failed')
      },
      uploadPayload: async () => {
        isExecuted = true;
      }
    }

    const headersList: any[] = []
    const request: any = {}
    const response: any = {
      headersSent: true,
      setHeader: (header: any, value: any) => { headersList.push({ header, value }) },
      getHeader: () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 1 }, transporter, (error) => { errorData = error })
    expect(await responseHandler("111111", request, response)).toBe("111111");
    expect(isExecuted).toBe(true)
    expect(headersList).toStrictEqual([])
    expect(console.error).toHaveBeenCalledTimes(0);
    expect(errorData).toBeInstanceOf(Error)

  });
})

describe('connector-request handler test suite ', () => {

  test('request middleware runs when there is no Heavy Http Headers', async () => {
    const request: any = { headers: {} }
    const response: any = {}
    const transporter: any = {}

    let isExecuted = false;

    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { isExecuted = true; });
    expect(isExecuted).toBe(true);
  });

  test('request middleware throws error for invalid heavy http action', async () => {
    const request: any = { headers: { [X_HEAVY_HTTP_ACTION]: 'invalid' } }
    const response: any = {}
    const transporter: any = {}

    let errorDetails = null;

    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, (error: any) => { errorDetails = error; });
    expect(errorDetails).toBeInstanceOf(Error);
  });

  test('request middleware throws error in a the heavy http init flow for http id failures', async () => {
    const request: any = { headers: { [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.INIT } }
    const response: any = {}
    const transporter: any = {
      generateUploadURL: async () => { }
    }
    let errorDetails = null;
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, (error: any) => { errorDetails = error })
    expect(errorDetails).toBeInstanceOf(Error);
  });

  test('request middleware throws error in a the heavy http init flow for transporter failures', async () => {
    const request: any = { headers: { [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.INIT, [X_HEAVY_HTTP_ID]: '121212122' } }
    const response: any = {}
    const transporter: any = {
      generateUploadURL: async () => {
        throw new Error('Mock Failed')
      }
    }
    let errorDetails = null;
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, (error: any) => { errorDetails = error })
    expect(errorDetails).toBeInstanceOf(Error);
  });

  test('request middleware sends the upload url in the init flow', async () => {
    let isExecuted = false;
    let responseData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.INIT, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      write: (responseText: any) => { responseData = responseText },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      generateUploadURL: async () => {
        return "testURL"
      }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('testURL');
  });

  test('request middleware sends failure message in the send-error flow', async () => {
    let isExecuted = false;
    let responseData = null;
    let reponseCodeData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.SEND_ERROR, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      writeHead: (reponseCode: any, responseText: any) => { responseData = responseText, reponseCodeData = reponseCode },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      deletePaylod: async () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('Heavy HTTP Request Failed');
    expect(reponseCodeData).toBe(500);

  });


  test('request middleware sends complete message in the download-end flow', async () => {
    let isExecuted = false;
    let responseData = null;
    let reponseCodeData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.DOWNLOAD_END, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      writeHead: (reponseCode: any, responseText: any) => { responseData = responseText, reponseCodeData = reponseCode },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      deletePaylod: async () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('Heavy HTTP Response Completed');
    expect(reponseCodeData).toBe(200);

  });


  test('request middleware sends failure message in the download-end flow with error', async () => {
    let isExecuted = false;
    let responseData = null;
    let reponseCodeData = null;
    let errorData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.DOWNLOAD_END, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      writeHead: (reponseCode: any, responseText: any) => { responseData = responseText, reponseCodeData = reponseCode },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      deletePaylod: async () => { throw new Error('Mock error') }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter, (error: any) => { errorData = error })
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('Heavy HTTP Response Completed');
    expect(reponseCodeData).toBe(200);
    expect(errorData).toBeInstanceOf(Error);


  });

  test('request middleware sends abort message in the send-abort flow', async () => {
    let isExecuted = false;
    let responseData = null;
    let reponseCodeData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.SEND_ABORT, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      writeHead: (reponseCode: any, responseText: any) => { responseData = responseText, reponseCodeData = reponseCode },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      deletePaylod: async () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('Heavy HTTP Process Aborted');
    expect(reponseCodeData).toBe(200);

  });


  test('request middleware sends abort message in the send-abort flow with error', async () => {
    let isExecuted = false;
    let responseData = null;
    let reponseCodeData = null;
    let errorData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.SEND_ABORT, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      writeHead: (reponseCode: any, responseText: any) => { responseData = responseText, reponseCodeData = reponseCode },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      deletePaylod: async () => { throw new Error('Mock error') }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter, (error: any) => { errorData = error })
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('Heavy HTTP Process Aborted');
    expect(reponseCodeData).toBe(200);
    expect(errorData).toBeInstanceOf(Error);

  });

  test('request middleware sends abort message in the download-abort flow', async () => {
    let isExecuted = false;
    let responseData = null;
    let reponseCodeData = null;
    const request: any = {
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.DOWNLOAD_ABORT, [X_HEAVY_HTTP_ID]: '121212122'
      }
    }
    const response: any = {
      writeHead: (reponseCode: any, responseText: any) => { responseData = responseText, reponseCodeData = reponseCode },
      end: () => { isExecuted = true }
    }
    const transporter: any = {
      deletePaylod: async () => { }
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { })
    expect(isExecuted).toBe(true);
    expect(responseData).toBe('Heavy HTTP Process Aborted');
    expect(reponseCodeData).toBe(200);

  });


  test('request middleware forward the modified request in the send-success flow', async () => {
    const eventArray: any[] = [];
    const dataArray: any[] = [];
    const request: any = {
      emit: (eventName: any, data: any) => {
        eventArray.push(eventName);
        dataArray.push(data)
      },
      rawHeaders: ['content-length', 1, null, 'content-type', 'test-type'],
      headers: {
        [X_HEAVY_HTTP_ACTION]: X_HEAVY_HTTP_ACTIONS.SEND_SUCCESS, [X_HEAVY_HTTP_ID]: '121212122'
      },

    }
    const response: any = {}
    const transporter: any = {
      deletePaylod: async () => { },
      getPaylod: async () => ({ content: 'returnData', contentLength: 10, contentType: 'test-type' })
    }
    const { responseHandler, requestHandler } = connector({ responseSize: 100 }, transporter)
    await requestHandler(request, response, () => { })

    request.emit('data', 'testData')
    request.emit('other', 'testOtherData')
    expect(eventArray).toStrictEqual(['data', 'other']);
    expect(dataArray).toStrictEqual(['testData', 'testOtherData']);
    expect(request.rawHeaders).toStrictEqual(['content-length', 10, null, 'content-type', 'test-type']);
  });

})