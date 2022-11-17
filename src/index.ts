import { X_HEAVY_HTTP_ACTION, X_HEAVY_HTTP_ACTIONS, X_HEAVY_HTTP_ID } from "./constant";
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
        throw new Error("Response Size must be a non-negative integer")
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
        } catch (e) {
            throw new Error("Heavy Request Failed, caused by: "+(e as Error).stack+"\n")
        }
        next();
    };
}
