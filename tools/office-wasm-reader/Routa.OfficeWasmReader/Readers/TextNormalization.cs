using System.Text.RegularExpressions;

namespace Routa.OfficeWasmReader;

internal static partial class TextNormalization
{
    public static string Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "";
        }

        return WhitespacePattern().Replace(value, " ").Trim();
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespacePattern();
}
