using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Paqueteria.Api.Data.Migrations
{
    /// <summary>
    /// Búsqueda sin distinguir acentos ("lopez" encuentra "López"): la extensión <c>unaccent</c>, las funciones
    /// <c>fn_sin_tildes</c> y <c>fn_patron_contiene_sin_tildes</c> y el índice de trigramas del nombre completo sin
    /// tildes, que reemplaza a <c>ix_clientes_nombre_trgm</c>. No cambia el modelo de EF.
    /// </summary>
    /// <remarks>
    /// Debe aplicarse con el dueño del esquema. <c>unaccent</c> es una extensión confiable (trusted): la crea el dueño de
    /// la BD sin ser superusuario, como <c>postgres</c> en Supabase.
    /// </remarks>
    public partial class BusquedaSinTildes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Como en schema.sql: las extensiones pueden estar en public o (Supabase) en extensions.
            migrationBuilder.Sql("set local search_path = paqueteria, public, extensions;");

            // En Supabase, en el esquema extensions, como las instala el panel (en public, la Data API las expondría);
            // en un PostgreSQL sin ese esquema, en el predeterminado.
            migrationBuilder.Sql("""
                do $$
                begin
                  if exists (select 1 from pg_namespace where nspname = 'extensions') then
                    create extension if not exists unaccent schema extensions;
                  else
                    create extension if not exists unaccent;
                  end if;
                end $$;
                """);

            // unaccent(texto) es STABLE (depende del search_path y del diccionario por defecto) y un índice exige una
            // función IMMUTABLE. El cuerpo SQL estándar (RETURN) se resuelve al crearla: la función y el diccionario
            // quedan fijos, así que no depende del search_path de quien la ejecute (la API no tiene el de extensions).
            migrationBuilder.Sql("""
                create function fn_sin_tildes(p_texto text)
                returns text
                language sql immutable parallel safe strict
                return unaccent('unaccent'::regdictionary, p_texto);

                comment on function fn_sin_tildes(text) is 'Texto sin tildes (unaccent), inmutable para usarlo en índices: búsqueda de clientes y usuarios';
                grant execute on function fn_sin_tildes(text) to paqueteria_api;
                """);

            // Busqueda.PatronContiene (% y _ literales), pero escapando después de unaccent, que convierte "％", "＿" y
            // "＼" (ancho completo) en "%", "_" y "\": escapando antes, quedarían como comodines.
            migrationBuilder.Sql("""
                create function fn_patron_contiene_sin_tildes(p_texto text)
                returns text
                language sql immutable parallel safe strict
                return '%' || replace(replace(replace(fn_sin_tildes(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%';

                comment on function fn_patron_contiene_sin_tildes(text) is 'Patrón ILIKE "contiene" sin tildes para lo que escribió el usuario (% y _ literales, escape \)';
                grant execute on function fn_patron_contiene_sin_tildes(text) to paqueteria_api;
                """);

            // Misma expresión que la búsqueda de ClientesService: si no coincide, PostgreSQL no usa el índice.
            migrationBuilder.Sql("""
                create index ix_clientes_nombre_sin_tildes_trgm on clientes
                  using gin (fn_sin_tildes(nombres || ' ' || apellidos) gin_trgm_ops);
                drop index ix_clientes_nombre_trgm;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("set local search_path = paqueteria, public, extensions;");

            // La extensión se deja: pudo existir antes de esta migración y quitarla no cambia el esquema paqueteria.
            migrationBuilder.Sql("""
                create index ix_clientes_nombre_trgm on clientes using gin ((nombres || ' ' || apellidos) gin_trgm_ops);
                drop index ix_clientes_nombre_sin_tildes_trgm;
                drop function fn_patron_contiene_sin_tildes(text);
                drop function fn_sin_tildes(text);
                """);
        }
    }
}
