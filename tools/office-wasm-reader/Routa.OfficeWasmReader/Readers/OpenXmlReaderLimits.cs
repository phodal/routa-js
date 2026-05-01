namespace Routa.OfficeWasmReader;

internal static class OpenXmlReaderLimits
{
    public const int MaxDocumentTextBlocks = 400;
    public const int MaxSlides = 200;
    public const int MaxSlideTextBlocks = 80;
    public const int MaxSheets = 25;
    public const int MaxRowsPerSheet = 120;
    public const int MaxCellsPerRow = 60;
    public const int MaxTables = 80;
    public const int MaxRowsPerTable = 80;
    public const int MaxImages = 80;
    public const int MaxImageBytes = 8 * 1024 * 1024;
}
