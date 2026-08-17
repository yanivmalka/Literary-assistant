// Type declarations for mammoth (no official types available)
declare module 'mammoth' {
  interface ConversionMessage {
    type: 'warning' | 'error'
    message: string
  }

  interface ConversionResult {
    value: string
    messages: ConversionMessage[]
  }

  interface Input {
    buffer?: Buffer
    path?: string
    arrayBuffer?: ArrayBuffer
  }

  function convertToHtml(input: Input): Promise<ConversionResult>
  function extractRawText(input: Input): Promise<ConversionResult>

  export { convertToHtml, extractRawText, ConversionResult, ConversionMessage, Input }
}
