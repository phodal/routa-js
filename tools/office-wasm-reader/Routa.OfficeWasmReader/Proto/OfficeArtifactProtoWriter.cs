using Google.Protobuf;

namespace Routa.OfficeWasmReader;

internal static class OfficeArtifactProtoWriter
{
    public static byte[] Write(OfficeArtifactModel artifact)
    {
        return Message(output =>
        {
            WriteString(output, 1, artifact.SourceKind);
            WriteString(output, 2, artifact.Title);

            foreach (var block in artifact.TextBlocks)
            {
                WriteMessage(output, 3, WriteTextBlock(block));
            }

            foreach (var sheet in artifact.Sheets)
            {
                WriteMessage(output, 4, WriteSheet(sheet));
            }

            foreach (var slide in artifact.Slides)
            {
                WriteMessage(output, 5, WriteSlide(slide));
            }

            foreach (var diagnostic in artifact.Diagnostics)
            {
                WriteMessage(output, 6, WriteDiagnostic(diagnostic));
            }

            foreach (var item in artifact.Metadata.OrderBy(item => item.Key, StringComparer.Ordinal))
            {
                WriteMessage(output, 7, WriteMetadata(item.Key, item.Value));
            }

            foreach (var image in artifact.Images)
            {
                WriteMessage(output, 8, WriteImage(image));
            }

            foreach (var table in artifact.Tables)
            {
                WriteMessage(output, 9, WriteTable(table));
            }
        });
    }

    private static byte[] WriteTextBlock(TextBlockModel block)
    {
        return Message(output =>
        {
            WriteString(output, 1, block.Path);
            WriteString(output, 2, block.Text);
        });
    }

    private static byte[] WriteSheet(SheetModel sheet)
    {
        return Message(output =>
        {
            WriteString(output, 1, sheet.Name);
            foreach (var row in sheet.Rows)
            {
                WriteMessage(output, 2, WriteRow(row));
            }
        });
    }

    private static byte[] WriteTable(TableModel table)
    {
        return Message(output =>
        {
            WriteString(output, 1, table.Path);
            foreach (var row in table.Rows)
            {
                WriteMessage(output, 2, WriteRow(row));
            }
        });
    }

    private static byte[] WriteRow(RowModel row)
    {
        return Message(output =>
        {
            foreach (var cell in row.Cells)
            {
                WriteMessage(output, 1, WriteCell(cell));
            }
        });
    }

    private static byte[] WriteCell(CellModel cell)
    {
        return Message(output =>
        {
            WriteString(output, 1, cell.Address);
            WriteString(output, 2, cell.Text);
            WriteString(output, 3, cell.Formula);
        });
    }

    private static byte[] WriteSlide(SlideModel slide)
    {
        return Message(output =>
        {
            WriteUInt32(output, 1, slide.Index);
            WriteString(output, 2, slide.Title);
            foreach (var block in slide.TextBlocks)
            {
                WriteMessage(output, 3, WriteTextBlock(block));
            }
        });
    }

    private static byte[] WriteDiagnostic(DiagnosticModel diagnostic)
    {
        return Message(output =>
        {
            WriteString(output, 1, diagnostic.Level);
            WriteString(output, 2, diagnostic.Message);
        });
    }

    private static byte[] WriteMetadata(string key, string value)
    {
        return Message(output =>
        {
            WriteString(output, 1, key);
            WriteString(output, 2, value);
        });
    }

    private static byte[] WriteImage(ImageAssetModel image)
    {
        return Message(output =>
        {
            WriteString(output, 1, image.Id);
            WriteString(output, 2, image.Path);
            WriteString(output, 3, image.ContentType);
            WriteBytes(output, 4, image.Bytes);
        });
    }

    private static byte[] Message(Action<CodedOutputStream> write)
    {
        using var stream = new MemoryStream();
        var output = new CodedOutputStream(stream);
        write(output);
        output.Flush();
        return stream.ToArray();
    }

    private static void WriteMessage(CodedOutputStream output, int fieldNumber, byte[] bytes)
    {
        output.WriteTag(fieldNumber, WireFormat.WireType.LengthDelimited);
        output.WriteLength(bytes.Length);
        output.WriteRawBytes(bytes);
    }

    private static void WriteString(CodedOutputStream output, int fieldNumber, string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return;
        }

        output.WriteTag(fieldNumber, WireFormat.WireType.LengthDelimited);
        output.WriteString(value);
    }

    private static void WriteBytes(CodedOutputStream output, int fieldNumber, byte[]? value)
    {
        if (value is null || value.Length == 0)
        {
            return;
        }

        output.WriteTag(fieldNumber, WireFormat.WireType.LengthDelimited);
        output.WriteBytes(ByteString.CopyFrom(value));
    }

    private static void WriteUInt32(CodedOutputStream output, int fieldNumber, uint value)
    {
        output.WriteTag(fieldNumber, WireFormat.WireType.Varint);
        output.WriteUInt32(value);
    }
}
