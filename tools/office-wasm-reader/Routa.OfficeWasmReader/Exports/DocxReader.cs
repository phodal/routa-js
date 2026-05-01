using System.Runtime.InteropServices.JavaScript;
using Routa.OfficeWasmReader;

public static partial class DocxReader
{
    [JSExport]
    public static byte[] ExtractDocxProto(byte[] bytes, bool ignoreErrors)
    {
        return OfficeArtifactExtractor.ExtractDocxProto(bytes, ignoreErrors);
    }
}
