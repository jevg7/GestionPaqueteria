using System.Collections.Frozen;
using System.Text;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Paqueteria.Api.Data;

/// <summary>
/// Guarda un enum de C# como texto UPPER_SNAKE, el formato de las enumeraciones
/// VARCHAR + CHECK del esquema: <c>EnTransito</c> &lt;-&gt; <c>'EN_TRANSITO'</c>.
/// Un valor que no pertenece al enum (en C# o en la BD) produce un error en lugar de
/// guardarse o leerse en silencio.
/// </summary>
public sealed class UpperSnakeEnumConverter<TEnum>() : ValueConverter<TEnum, string>(
    valor => UpperSnakeEnum<TEnum>.ATexto(valor),
    texto => UpperSnakeEnum<TEnum>.DesdeTexto(texto))
    where TEnum : struct, Enum;

public static class UpperSnakeEnum<TEnum> where TEnum : struct, Enum
{
    private static readonly FrozenDictionary<TEnum, string> Textos =
        Enum.GetValues<TEnum>().ToFrozenDictionary(v => v, v => UpperSnake.DesdePascalCase(v.ToString()));

    private static readonly FrozenDictionary<string, TEnum> Valores =
        Textos.ToFrozenDictionary(par => par.Value, par => par.Key, StringComparer.Ordinal);

    public static string ATexto(TEnum valor) =>
        Textos.TryGetValue(valor, out var texto)
            ? texto
            : throw new InvalidOperationException(
                $"'{valor}' no es un valor válido de {typeof(TEnum).Name}; no se puede guardar en la base de datos.");

    /// <summary>Para lo que escribe el usuario (filtros): no distingue mayúsculas ni espacios alrededor.</summary>
    public static TEnum? DesdeTextoDeUsuario(string texto) =>
        Valores.TryGetValue(texto.Trim().ToUpperInvariant(), out var valor) ? valor : null;

    public static TEnum DesdeTexto(string texto) =>
        Valores.TryGetValue(texto, out var valor)
            ? valor
            : throw new InvalidOperationException(
                $"La base de datos devolvió '{texto}', que no corresponde a ningún valor de {typeof(TEnum).Name}.");
}

public static class UpperSnake
{
    /// <summary>
    /// <c>EnTransito</c> -&gt; <c>EN_TRANSITO</c>, <c>RetiroEnAgencia</c> -&gt; <c>RETIRO_EN_AGENCIA</c>,
    /// <c>Usd</c> -&gt; <c>USD</c>. Separa antes de cada mayúscula que sigue a una minúscula o dígito.
    /// </summary>
    public static string DesdePascalCase(string nombre)
    {
        var resultado = new StringBuilder(nombre.Length + 4);
        for (var i = 0; i < nombre.Length; i++)
        {
            var c = nombre[i];
            if (i > 0 && char.IsUpper(c) && (char.IsLower(nombre[i - 1]) || char.IsDigit(nombre[i - 1])))
            {
                resultado.Append('_');
            }
            resultado.Append(char.ToUpperInvariant(c));
        }
        return resultado.ToString();
    }
}
