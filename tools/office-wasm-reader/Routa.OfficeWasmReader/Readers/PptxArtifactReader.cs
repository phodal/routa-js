using DocumentFormat.OpenXml.Packaging;
using A = DocumentFormat.OpenXml.Drawing;
using P = DocumentFormat.OpenXml.Presentation;

namespace Routa.OfficeWasmReader;

internal static class PptxArtifactReader
{
    public static OfficeArtifactModel Read(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes, writable: false);
        using var document = PresentationDocument.Open(stream, false);

        var artifact = new OfficeArtifactModel
        {
            SourceKind = "pptx",
            Title = TextNormalization.Clean(document.PackageProperties.Title),
        };
        artifact.Metadata["reader"] = "routa-office-wasm-reader";

        var presentationPart = document.PresentationPart;
        var slideIds = presentationPart?.Presentation.SlideIdList?.Elements<P.SlideId>() ?? Enumerable.Empty<P.SlideId>();
        var slideIndex = 1u;

        foreach (var slideId in slideIds)
        {
            if (artifact.Slides.Count >= OpenXmlReaderLimits.MaxSlides)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "PPTX slide limit reached."));
                break;
            }

            var relationshipId = slideId.RelationshipId?.Value;
            if (presentationPart is null || string.IsNullOrEmpty(relationshipId))
            {
                continue;
            }

            if (presentationPart.GetPartById(relationshipId) is not SlidePart slidePart)
            {
                continue;
            }

            var slide = new SlideModel { Index = slideIndex };
            var textIndex = 0;
            foreach (var textElement in slidePart.Slide.Descendants<A.Text>())
            {
                var text = TextNormalization.Clean(textElement.Text);
                if (text.Length == 0)
                {
                    continue;
                }

                slide.TextBlocks.Add(new TextBlockModel($"slides[{slideIndex}].text[{textIndex}]", text));
                slide.Title = FirstNonEmpty(slide.Title, text);
                artifact.Title = FirstNonEmpty(artifact.Title, text);
                textIndex++;

                if (slide.TextBlocks.Count >= OpenXmlReaderLimits.MaxSlideTextBlocks)
                {
                    artifact.Diagnostics.Add(new DiagnosticModel("warning", $"PPTX slide {slideIndex} text block limit reached."));
                    break;
                }
            }

            ExtractSlideTables(slidePart, artifact, slideIndex);
            ExtractSlideImages(slidePart, artifact, slideIndex);

            artifact.Slides.Add(slide);
            slideIndex++;
        }

        artifact.Metadata["slideCount"] = artifact.Slides.Count.ToString();
        artifact.Metadata["tableCount"] = artifact.Tables.Count.ToString();
        artifact.Metadata["imageCount"] = artifact.Images.Count.ToString();
        return artifact;
    }

    private static void ExtractSlideTables(SlidePart slidePart, OfficeArtifactModel artifact, uint slideIndex)
    {
        var tableIndex = 0;
        foreach (var tableElement in slidePart.Slide.Descendants<A.Table>())
        {
            if (artifact.Tables.Count >= OpenXmlReaderLimits.MaxTables)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "PPTX table limit reached."));
                break;
            }

            var table = new TableModel { Path = $"slides[{slideIndex}].table[{tableIndex}]" };
            foreach (var rowElement in tableElement.Elements<A.TableRow>().Take(OpenXmlReaderLimits.MaxRowsPerTable))
            {
                var row = new RowModel();
                foreach (var cellElement in rowElement.Elements<A.TableCell>().Take(OpenXmlReaderLimits.MaxCellsPerRow))
                {
                    var text = TextNormalization.Clean(string.Concat(cellElement.Descendants<A.Text>().Select(item => item.Text)));
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

    private static void ExtractSlideImages(SlidePart slidePart, OfficeArtifactModel artifact, uint slideIndex)
    {
        foreach (var imagePart in slidePart.ImageParts)
        {
            if (artifact.Images.Count >= OpenXmlReaderLimits.MaxImages)
            {
                artifact.Diagnostics.Add(new DiagnosticModel("warning", "PPTX image limit reached."));
                break;
            }

            var image = OpenXmlImageReader.Read(slidePart, imagePart, $"slides[{slideIndex}].image[{artifact.Images.Count}]");
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
