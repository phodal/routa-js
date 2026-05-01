namespace Routa.OfficeWasmReader;

internal sealed class OfficeArtifactModel
{
    public string SourceKind { get; init; } = "";
    public string Title { get; set; } = "";
    public List<TextBlockModel> TextBlocks { get; } = [];
    public List<SheetModel> Sheets { get; } = [];
    public List<SlideModel> Slides { get; } = [];
    public List<DiagnosticModel> Diagnostics { get; } = [];
    public Dictionary<string, string> Metadata { get; } = [];
    public List<ImageAssetModel> Images { get; } = [];
    public List<TableModel> Tables { get; } = [];
}

internal sealed record TextBlockModel(string Path, string Text);

internal sealed class SheetModel
{
    public string Name { get; init; } = "";
    public List<RowModel> Rows { get; } = [];
}

internal sealed class TableModel
{
    public string Path { get; init; } = "";
    public List<RowModel> Rows { get; } = [];
}

internal sealed class RowModel
{
    public List<CellModel> Cells { get; } = [];
}

internal sealed record CellModel(string Address, string Text, string Formula);

internal sealed class SlideModel
{
    public uint Index { get; init; }
    public string Title { get; set; } = "";
    public List<TextBlockModel> TextBlocks { get; } = [];
}

internal sealed record DiagnosticModel(string Level, string Message);

internal sealed record ImageAssetModel(string Id, string Path, string ContentType, byte[] Bytes);
