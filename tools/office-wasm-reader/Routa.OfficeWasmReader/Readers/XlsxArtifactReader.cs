using DocumentFormat.OpenXml.Packaging;
using S = DocumentFormat.OpenXml.Spreadsheet;

namespace Routa.OfficeWasmReader;

internal static class XlsxArtifactReader
{
    public static OfficeArtifactModel Read(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        using var document = SpreadsheetDocument.Open(stream, false);

        var artifact = new OfficeArtifactModel
        {
            SourceKind = "xlsx",
            Title = TextNormalization.Clean(document.PackageProperties.Title),
        };
        artifact.Metadata["reader"] = "routa-office-wasm-reader";

        var workbookPart = document.WorkbookPart;
        if (workbookPart?.Workbook.Sheets is null)
        {
            artifact.Diagnostics.Add(new DiagnosticModel("warning", "XLSX has no workbook sheets."));
            return artifact;
        }

        var sharedStrings = workbookPart.SharedStringTablePart?.SharedStringTable;
        foreach (var sheetElement in workbookPart.Workbook.Sheets.Elements<S.Sheet>())
        {
            if (artifact.Sheets.Count >= OpenXmlReaderLimits.MaxSheets)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "XLSX sheet limit reached."));
                break;
            }

            var relationshipId = sheetElement.Id?.Value;
            if (string.IsNullOrEmpty(relationshipId))
            {
                continue;
            }

            if (workbookPart.GetPartById(relationshipId) is not WorksheetPart worksheetPart)
            {
                continue;
            }

            var sheet = new SheetModel
            {
                Name = TextNormalization.Clean(sheetElement.Name?.Value) is { Length: > 0 } name ? name : $"Sheet {artifact.Sheets.Count + 1}",
            };
            artifact.Title = FirstNonEmpty(artifact.Title, sheet.Name);

            foreach (var rowElement in worksheetPart.Worksheet.Descendants<S.Row>().Take(OpenXmlReaderLimits.MaxRowsPerSheet))
            {
                var row = new RowModel();
                foreach (var cellElement in rowElement.Elements<S.Cell>().Take(OpenXmlReaderLimits.MaxCellsPerRow))
                {
                    row.Cells.Add(new CellModel(
                        cellElement.CellReference?.Value ?? "",
                        ReadCellText(cellElement, sharedStrings),
                        TextNormalization.Clean(cellElement.CellFormula?.Text)));
                }

                if (row.Cells.Count > 0)
                {
                    sheet.Rows.Add(row);
                }
            }

            artifact.Sheets.Add(sheet);
        }

        ExtractImages(workbookPart, artifact);

        artifact.Metadata["sheetCount"] = artifact.Sheets.Count.ToString();
        artifact.Metadata["imageCount"] = artifact.Images.Count.ToString();
        return artifact;
    }

    private static string ReadCellText(S.Cell cell, S.SharedStringTable? sharedStrings)
    {
        var raw = cell.CellValue?.Text ?? cell.InnerText;
        if (string.IsNullOrEmpty(raw))
        {
            return "";
        }

        if (cell.DataType?.Value == S.CellValues.SharedString && int.TryParse(raw, out var sharedStringIndex))
        {
            return TextNormalization.Clean(sharedStrings?.Elements<S.SharedStringItem>().ElementAtOrDefault(sharedStringIndex)?.InnerText);
        }

        if (cell.DataType?.Value == S.CellValues.Boolean)
        {
            return raw == "1" ? "TRUE" : "FALSE";
        }

        return TextNormalization.Clean(raw);
    }

    private static void ExtractImages(WorkbookPart workbookPart, OfficeArtifactModel artifact)
    {
        foreach (var worksheetPart in workbookPart.WorksheetParts)
        {
            var drawingPart = worksheetPart.DrawingsPart;
            if (drawingPart is null)
            {
                continue;
            }

            foreach (var imagePart in drawingPart.ImageParts)
            {
                if (artifact.Images.Count >= OpenXmlReaderLimits.MaxImages)
                {
                    artifact.Diagnostics.Add(new DiagnosticModel("warning", "XLSX image limit reached."));
                    return;
                }

                var image = OpenXmlImageReader.Read(drawingPart, imagePart, $"worksheets.image[{artifact.Images.Count}]");
                if (image is not null)
                {
                    artifact.Images.Add(image);
                }
            }
        }
    }

    private static string FirstNonEmpty(string current, string candidate)
    {
        return string.IsNullOrWhiteSpace(current) ? candidate : current;
    }
}
