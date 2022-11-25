import { X_HEAVY_HTTP_ACTION, X_HEAVY_HTTP_ACTIONS, X_HEAVY_HTTP_ID, X_HEAVY_HTTP_STREAM } from "./constant";
import { IncomingMessage, ServerResponse } from "http";

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
}


export const connector = (connectorConfig: ConnectorConfig, transporter: Transporter): Function => {

    if (connectorConfig.responseSize < 0) {
        throw new Error("Response Size must be a non-negative value")
    }

    return async function (req: IncomingMessage, res: ServerResponse, next: (err?: any) => any) {

        try {
            if (X_HEAVY_HTTP_ACTION in req.headers && req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.INIT) {
                const uniqueId = req.headers[X_HEAVY_HTTP_ID];
                if (typeof uniqueId === 'string') {
                    const responseText = await transporter.generateUploadURL(uniqueId);
                    res.write(responseText);
                    return res.end();
                } else {
                    throw new Error("Invalid Heavy Request");
                }
                ;
            }

            if (X_HEAVY_HTTP_ACTION in req.headers && req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.SEND_ERROR) {
                const uniqueId = req.headers[X_HEAVY_HTTP_ID];
                if (typeof uniqueId === 'string') {
                    await transporter.deletePaylod(uniqueId);
                    res.writeHead(500, 'Heavy Request Failed');
                    return res.end();
                } else {
                    throw new Error("Invalid Heavy Request");
                }

            }

            if (X_HEAVY_HTTP_ACTION in req.headers && req.headers[X_HEAVY_HTTP_ACTION] === X_HEAVY_HTTP_ACTIONS.SEND_SUCCESS) {

                const uniqueId = req.headers[X_HEAVY_HTTP_ID];

                if (typeof uniqueId === 'string') {

                    const emitter = req.emit

                    const item = await transporter.getPaylod(uniqueId);

                    await transporter.deletePaylod(uniqueId);

                    req.headers['content-length'] = item.contentLength;

                    req.headers['content-type'] = item.contentType;

                    for (let i = 0; i < req.rawHeaders.length; i++) {
                        if (req.rawHeaders[i].toLowerCase() === 'content-length') {
                            req.rawHeaders[i + 1] = item.contentLength;
                        }

                        if (req.rawHeaders[i].toLowerCase() === 'content-type') {
                            req.rawHeaders[i + 1] = item.contentType;
                        }
                    }

                    req.emit = (eventName: string, ...data: any) => {
                        if (eventName === 'data') {
                            return emitter.apply(req, [eventName, item.content])
                        }
                        return emitter.apply(req, [eventName, ...data])

                    }
                } else {
                    throw new Error("Invalid Heavy Request");
                }

            }


            const responseMap = {
                content: new Map(),
                isStreamed: false,
                writeHead:()=>{},
                write:()=>{}
            }

            const oldWriteHead = res.writeHead

            res.writeHead = function () {

                responseMap.isStreamed = res.hasHeader('dsdsdsdsdsd');

                let possiableHeaders = null;
                if (!responseMap.isStreamed) {
                    if (arguments.length === 3) {
                        possiableHeaders = arguments[2];
                    } else if (arguments.length === 2) {
                        possiableHeaders = arguments[1];
                    }

                    if (possiableHeaders) {

                        if (Array.isArray(possiableHeaders) && possiableHeaders.includes(X_HEAVY_HTTP_STREAM)) {
                            responseMap.isStreamed = true;

                        } else if (possiableHeaders[X_HEAVY_HTTP_STREAM]) {
                            responseMap.isStreamed = true;
                        }
                    }
                }

                if (responseMap.isStreamed) {
                    const argumentsTyped: any = arguments;
                    oldWriteHead.apply(res, argumentsTyped);
                }else {
                    responseMap.writeHead = ()=>{
                        const argumentsTyped: any = arguments;
                        oldWriteHead.apply(res, argumentsTyped);
                    }
                }
                return res;
            }

            const oldWrite = res.write

            res.write = function (data: any, encodingOrCb: BufferEncoding | undefined | ((error: Error | null | undefined) => void), cb?: (error: Error | null | undefined) => void | undefined): boolean {

                if (responseMap.isStreamed) {
                    const argumentsTyped: any = arguments;
                    oldWrite.apply(res, argumentsTyped);
                } else {
                    res.getHeaders()
                    responseMap.content.set('data',data);
                    responseMap.content.set('callback',()=>{});

                    if(encodingOrCb && typeof encodingOrCb ==='string'){
                        responseMap.content.set('encoding',encodingOrCb);
                    }else if(encodingOrCb){
                        responseMap.content.set('callback',encodingOrCb);
                    }

                    if(cb){
                        responseMap.content.set('callback',cb);
                    }

                    responseMap.write = ()=>{
                        const argumentsTyped: any = arguments;
                        oldWrite.apply(res, argumentsTyped);
                    }
                }
                return true;
            }

            const oldSend = res.end

            res.end = function (endData: any, endDataEncodingOrCb?: BufferEncoding | undefined | (() => void), cb?: () => void | undefined): ServerResponse<IncomingMessage> {

                let finalData = Buffer.from('');
                
                const data  = responseMap.content.get('data');
                const encoding  = responseMap.content.get('encoding');
                const callBack  = responseMap.content.get('callback');

                let endCallback = ()=>{
                    if(cb){
                        cb();
                    }
                }

                if (Buffer.isBuffer(data)) {
                        finalData = Buffer.concat([finalData, data]);
                } else if (typeof data === 'string') {
                        if (encoding) {
                            finalData = Buffer.concat([finalData, Buffer.from(data, encoding)])
                        } else {
                            finalData = Buffer.concat([finalData, Buffer.from(data)])
                        }
                    }

            

                if (endData) {
                    if (Buffer.isBuffer(endData)) {
                        finalData = Buffer.concat([finalData, endData]);
                    } else if (typeof endData === 'string') {
                        if(endDataEncodingOrCb){
                            if (typeof endDataEncodingOrCb === 'string') {
                                finalData = Buffer.concat([finalData, Buffer.from(endData, endDataEncodingOrCb)])
                            } else {
                                endCallback = endDataEncodingOrCb;
                                finalData = Buffer.concat([finalData, Buffer.from(endData)])
                            }
                        }else {
                            finalData = Buffer.concat([finalData, Buffer.from(endData)])
                        }
                    
                    }
                }

                if (finalData.byteLength > connectorConfig.responseSize) {
                    callBack();
                    res.setHeader(X_HEAVY_HTTP_ACTION,X_HEAVY_HTTP_ACTIONS.SEND_ERROR);
                    res.setHeader(X_HEAVY_HTTP_ID,'sdsdsdsds');
                    responseMap.writeHead();
                    return oldSend.apply(res, ["",'utf-8',endCallback])
                } 
                    
                responseMap.writeHead();
                responseMap.write();
                const argumentsTyped: any = arguments;
                return oldSend.apply(res, argumentsTyped);
            }

        } catch (e) {
            throw new Error("Heavy Request Failed, caused by: " + (e as Error).stack + "\n")
        }
        next();
    };
}
