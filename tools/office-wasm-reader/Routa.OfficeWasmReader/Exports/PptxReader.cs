using System.Runtime.InteropServices.JavaScript;
using Routa.OfficeWasmReader;

public static partial class PptxReader
{
    [JSExport]
    public static byte[] ExtractSlidesProto(byte[] bytes, bool ignoreErrors)
    {
        return OfficeArtifactExtractor.ExtractPptxProto(bytes, ignoreErrors);
    }
}
