using DocumentFormat.OpenXml.Packaging;

namespace Routa.OfficeWasmReader;

internal static class OpenXmlImageReader
{
    public static ImageAssetModel? Read(OpenXmlPartContainer container, ImagePart imagePart, string path)
    {
        var relationshipId = container.GetIdOfPart(imagePart);
        if (string.IsNullOrEmpty(relationshipId))
        {
            return null;
        }

        using var stream = imagePart.GetStream();
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        var bytes = memory.ToArray();
        if (bytes.Length == 0 || bytes.Length > OpenXmlReaderLimits.MaxImageBytes)
        {
            return null;
        }

        return new ImageAssetModel(relationshipId, path, imagePart.ContentType, bytes);
    }
}
