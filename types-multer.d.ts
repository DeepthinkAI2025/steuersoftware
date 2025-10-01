declare module 'multer' {
  import { RequestHandler } from 'express';
  interface StorageEngine {}
  interface DiskStorageOptions {
    destination?: any;
    filename?: any;
  }
  interface MulterOptions {
    storage?: StorageEngine;
    limits?: any;
    fileFilter?: any;
  }
  interface Multer {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    any(): RequestHandler;
  }
  function multer(options?: MulterOptions): Multer;
  namespace multer {
    function diskStorage(opts: DiskStorageOptions): StorageEngine;
  }
  export = multer;
}
