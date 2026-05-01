namespace Routa.OfficeWasmReader;

internal static class OfficeArtifactExtractor
{
    public static byte[] ExtractDocxProto(byte[] bytes, bool ignoreErrors)
    {
        return ExtractOrHandle("docx", ignoreErrors, () => DocxArtifactReader.Read(bytes));
    }

    public static byte[] ExtractPptxProto(byte[] bytes, bool ignoreErrors)
    {
        return ExtractOrHandle("pptx", ignoreErrors, () => PptxArtifactReader.Read(bytes));
    }

    public static byte[] ExtractXlsxProto(byte[] bytes, bool ignoreErrors)
    {
        return ExtractOrHandle("xlsx", ignoreErrors, () => XlsxArtifactReader.Read(bytes));
    }

    private static byte[] ExtractOrHandle(string sourceKind, bool ignoreErrors, Func<OfficeArtifactModel> read)
    {
        try
        {
            return OfficeArtifactProtoWriter.Write(read());
        }
        catch (Exception error) when (ignoreErrors)
        {
            var artifact = new OfficeArtifactModel
            {
                SourceKind = sourceKind,
                Title = $"{sourceKind.ToUpperInvariant()} parse failed",
            };
            artifact.Diagnostics.Add(new DiagnosticModel("error", error.Message));
            artifact.Metadata["reader"] = "routa-office-wasm-reader";
            return OfficeArtifactProtoWriter.Write(artifact);
        }
    }
}
