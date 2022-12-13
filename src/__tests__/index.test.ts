import { connector } from '../index';
import * as transformerProxy from 'transformer-proxy';
import * as crypto from 'crypto';

jest.mock('transformer-proxy');


const mockedDependency = <jest.Mock<typeof transformerProxy>>transformerProxy;


beforeEach(() => {
    jest.spyOn(crypto, 'randomBytes').mockImplementation(()=>'222222');
});



describe('connector test suite ', () => {

    test('connector fails with negative response size',  () => {
        const transporter:any = {}
        expect(()=>connector({ responseSize: -1},transporter)).toThrow(Error("Response Size must be a non-negative value"));
    });
})


describe('connector-response handler test suite ', () => {

    test('response is not modified when size is below the defined response size',  async () => {
      mockedDependency.mockImplementationOnce(fn=> fn)
      let isExecuted = false;
      const transporter:any = {uploadPayload: ()=>{
          isExecuted = true;
        }}
      const request:any = {}
      const response:any = {}
      const {responseHandler, requestHandler} =  connector({ responseSize: 100}, transporter)
      expect(await responseHandler("111111",request,response)).toBe("111111");
      expect(isExecuted).toBe(false)
      });

      test('response is modified when size is above the defined response size without headers sent',  async () => {
        mockedDependency.mockImplementationOnce(fn=> fn)
        let isExecuted = false;
        const transporter:any = {
          generateDownloadURL: async ()=>{
            return 'testURL'
          },
          uploadPayload: async ()=>{
            isExecuted = true;
          }}

        const headersList:any[] = []
        const request:any = {}
        const response:any = {
          headersSent: false,
          setHeader:(header:any,value:any)=>{headersList.push({header,value})},
          getHeader:()=>'ABCS'
        }
        const {responseHandler, requestHandler} =  connector({ responseSize: 1}, transporter)
        expect(await responseHandler("111111",request,response)).toBe("X_HEAVY_RESPONSE|222222|testURL");
        expect(isExecuted).toBe(true)
        expect(headersList).toStrictEqual( [
          { header: 'x-heavy-http-action', value: 'download' },
          { header: 'x-heavy-http-id', value: '222222' }
        ])
      });

      test('response is modified when size is above the defined response size with headers already sent',  async () => {

        mockedDependency.mockImplementationOnce(fn=> fn)
        let isExecuted = false;
        const transporter:any = {
          generateDownloadURL: async ()=>{
            return 'testURL'
          },
          uploadPayload: async ()=>{
            isExecuted = true;
          }}

        const headersList:any[] = []
        const request:any = {}
        const response:any = {
          headersSent: true,
          setHeader:(header:any,value:any)=>{headersList.push({header,value})},
          getHeader:()=>{}
        }
        const {responseHandler, requestHandler} =  connector({ responseSize: 1}, transporter)
        expect(await responseHandler("111111",request,response)).toBe("X_HEAVY_RESPONSE|222222|testURL");
        expect(isExecuted).toBe(true)
        expect(headersList).toStrictEqual([])
      });

      test('response modification failure and no error function is defined',  async () => {
        let errorData:any = null;
        console.error = jest.fn().mockImplementation(error=>errorData = error);
        mockedDependency.mockImplementationOnce(fn=> fn)
        let isExecuted = false;
        const transporter:any = {
          generateDownloadURL: async ()=>{
            throw new Error('Mock Failed')
          },
          uploadPayload: async ()=>{
            isExecuted = true;
          }}

        const headersList:any[] = []
        const request:any = {}
        const response:any = {
          headersSent: true,
          setHeader:(header:any,value:any)=>{headersList.push({header,value})},
          getHeader:()=>{}
        }
        const {responseHandler, requestHandler} =  connector({ responseSize: 1}, transporter)
        expect(await responseHandler("111111",request,response)).toBe("111111");
        expect(isExecuted).toBe(true)
        expect(headersList).toStrictEqual([])
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(errorData).toBeInstanceOf(Error)
      });



      test('response modification failure and error function is defined',  async () => {
        let errorData:any = null;
        console.error = jest.fn();
        mockedDependency.mockImplementationOnce(fn=> fn)
        let isExecuted = false;
        const transporter:any = {
          generateDownloadURL: async ()=>{
            throw new Error('Mock Failed')
          },
          uploadPayload: async ()=>{
            isExecuted = true;
          }}

        const headersList:any[] = []
        const request:any = {}
        const response:any = {
          headersSent: true,
          setHeader:(header:any,value:any)=>{headersList.push({header,value})},
          getHeader:()=>{}
        }
        const {responseHandler, requestHandler} =  connector({ responseSize: 1}, transporter, (error)=>{errorData = error})
        expect(await responseHandler("111111",request,response)).toBe("111111");
        expect(isExecuted).toBe(true)
        expect(headersList).toStrictEqual([])
        expect(console.error).toHaveBeenCalledTimes(0);
        expect(errorData).toBeInstanceOf(Error)

      });
})