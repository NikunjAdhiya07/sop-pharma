declare module 'pizzip' {
  class PizZip {
    constructor(data?: any, options?: any);
    file(name: string): { asText(): string };
    file(name: string, data: any, options?: any): this;
    folder(name: string): this;
    generate(options?: any): any;
    load(data: any, options?: any): this;
  }
  export default PizZip;
}
