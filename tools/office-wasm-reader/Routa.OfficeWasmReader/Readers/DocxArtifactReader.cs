using DocumentFormat.OpenXml.Packaging;
using W = DocumentFormat.OpenXml.Wordprocessing;

namespace Routa.OfficeWasmReader;

internal static class DocxArtifactReader
{
    public static OfficeArtifactModel Read(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        using var document = WordprocessingDocument.Open(stream, false);

        var artifact = new OfficeArtifactModel
        {
            SourceKind = "docx",
            Title = TextNormalization.Clean(document.PackageProperties.Title),
        };
        artifact.Metadata["reader"] = "routa-office-wasm-reader";

        var body = document.MainDocumentPart?.Document.Body;
        if (body is null)
        {
            artifact.Diagnostics.Add(new DiagnosticModel("warning", "DOCX has no main document body."));
            return artifact;
        }

        var index = 0;
        foreach (var paragraph in body.Descendants<W.Paragraph>())
        {
            var text = TextNormalization.Clean(string.Concat(paragraph.Descendants<W.Text>().Select(item => item.Text)));
            if (text.Length == 0)
            {
                continue;
            }

            artifact.TextBlocks.Add(new TextBlockModel($"body.paragraph[{index}]", text));
            artifact.Title = FirstNonEmpty(artifact.Title, text);
            index++;

            if (artifact.TextBlocks.Count >= OpenXmlReaderLimits.MaxDocumentTextBlocks)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "DOCX text block limit reached."));
                break;
            }
        }

        ExtractTables(body, artifact);
        ExtractImages(document, artifact);

        artifact.Metadata["textBlockCount"] = artifact.TextBlocks.Count.ToString();
        artifact.Metadata["tableCount"] = artifact.Tables.Count.ToString();
        artifact.Metadata["imageCount"] = artifact.Images.Count.ToString();
        return artifact;
    }

    private static void ExtractTables(W.Body body, OfficeArtifactModel artifact)
    {
        var tableIndex = 0;
        foreach (var tableElement in body.Descendants<W.Table>())
        {
            if (artifact.Tables.Count >= OpenXmlReaderLimits.MaxTables)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "DOCX table limit reached."));
                break;
            }

            var table = new TableModel { Path = $"body.table[{tableIndex}]" };
            foreach (var rowElement in tableElement.Elements<W.TableRow>().Take(OpenXmlReaderLimits.MaxRowsPerTable))
            {
                var row = new RowModel();
                foreach (var cellElement in rowElement.Elements<W.TableCell>().Take(OpenXmlReaderLimits.MaxCellsPerRow))
                {
                    var text = TextNormalization.Clean(string.Concat(cellElement.Descendants<W.Text>().Select(item => item.Text)));
                    row.Cells.Add(new CellModel("", text, ""));
                }

                if (row.Cells.Count > 0)
                {
                    table.Rows.Add(row);
                }
            }

            artifact.Tables.Add(table);
            tableIndex++;
        }
    }

    private static void ExtractImages(WordprocessingDocument document, OfficeArtifactModel artifact)
    {
        var mainPart = document.MainDocumentPart;
        if (mainPart is null)
        {
            return;
        }

        foreach (var imagePart in mainPart.ImageParts)
        {
            if (artifact.Images.Count >= OpenXmlReaderLimits.MaxImages)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "DOCX image limit reached."));
                break;
            }

            var image = OpenXmlImageReader.Read(mainPart, imagePart, $"word.image[{artifact.Images.Count}]");
            if (image is not null)
            {
                artifact.Images.Add(image);
            }
        }
    }

    private static string FirstNonEmpty(string current, string candidate)
    {
        return string.IsNullOrWhiteSpace(current) ? candidate : current;
    }
}
