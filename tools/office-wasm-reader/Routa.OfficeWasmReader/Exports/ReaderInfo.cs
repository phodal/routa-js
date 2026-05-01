using System.Runtime.InteropServices.JavaScript;

public static partial class ReaderInfo
{
    [JSExport]
    public static string GetReaderVersion()
    {
        return "routa-office-wasm-reader/0.1.0";
    }
}
