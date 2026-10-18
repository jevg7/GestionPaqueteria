using Microsoft.EntityFrameworkCore.Migrations;
using Paqueteria.Api.Data.Sql;

#nullable disable

namespace Paqueteria.Api.Data.Migrations
{
    /// <summary>
    /// Baseline v2 (SaaS multi-agencia): ejecuta database/schema.sql tal cual (recurso embebido,
    /// verificado por hash). El snapshot y el Designer se generaron con dotnet ef a partir del modelo,
    /// así que describen el mismo esquema y las migraciones siguientes parten de aquí.
    /// </summary>
    /// <remarks>Debe aplicarse con el dueño del esquema, nunca con el usuario de la API.</remarks>
    public partial class Baseline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(EsquemaBaseline.Leer());

            // EF crea la tabla de historial antes de ejecutar schema.sql, así que el
            // "grant ... on all tables in schema paqueteria" también se la otorgó a la API.
            // La API no debe leer ni escribir el historial de migraciones.
            migrationBuilder.Sql(
                $"""revoke all on table {PaqueteriaDbContext.Esquema}."{PaqueteriaDbContext.TablaHistorialMigraciones}" from paqueteria_api;""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException(
                "La migración Baseline no se revierte: borraría el esquema completo con sus datos. " +
                "Para empezar de cero, cree una base de datos nueva.");
        }
    }
}
