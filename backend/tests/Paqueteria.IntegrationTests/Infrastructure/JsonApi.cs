using System.Text.Json;
using System.Text.Json.Serialization;

namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>Las mismas opciones JSON que la API: enums como códigos de la BD ("EN_TRANSITO").</summary>
public static class JsonApi
{
    public static JsonSerializerOptions Opciones { get; } = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper) },
    };
}
