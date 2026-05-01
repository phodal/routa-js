using System.Runtime.InteropServices.JavaScript;
using Routa.OfficeWasmReader;

public static partial class XlsxReader
{
    [JSExport]
    public static byte[] ExtractXlsxProto(byte[] bytes, bool ignoreErrors)
    {
        return OfficeArtifactExtractor.ExtractXlsxProto(bytes, ignoreErrors);
    }
}
