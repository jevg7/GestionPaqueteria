using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using Paqueteria.Api.Data.Sql;

#nullable disable

namespace Paqueteria.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Contabilidad : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "asientos_contables",
                schema: "paqueteria",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    agencia_id = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "paqueteria.fn_agencia_actual()"),
                    fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    concepto = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    referencia = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    reversion_de_id = table.Column<long>(type: "bigint", nullable: true),
                    registrado_por_usuario_id = table.Column<long>(type: "bigint", nullable: false),
                    creado_en = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    creado_xid = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "txid_current()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("asientos_contables_pkey", x => x.id);
                    table.UniqueConstraint("uq_asientos_contables_id_agencia", x => new { x.id, x.agencia_id });
                    table.ForeignKey(
                        name: "asientos_contables_agencia_id_fkey",
                        column: x => x.agencia_id,
                        principalSchema: "paqueteria",
                        principalTable: "agencias",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "fk_asientos_contables_reversion",
                        columns: x => new { x.reversion_de_id, x.agencia_id },
                        principalSchema: "paqueteria",
                        principalTable: "asientos_contables",
                        principalColumns: new[] { "id", "agencia_id" });
                    table.ForeignKey(
                        name: "fk_asientos_contables_usuario",
                        columns: x => new { x.registrado_por_usuario_id, x.agencia_id },
                        principalSchema: "paqueteria",
                        principalTable: "usuarios",
                        principalColumns: new[] { "id", "agencia_id" });
                });

            migrationBuilder.CreateTable(
                name: "cuentas_contables",
                schema: "paqueteria",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    agencia_id = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "paqueteria.fn_agencia_actual()"),
                    codigo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    nombre = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    clasificacion = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    naturaleza = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    activo = table.Column<bool>(type: "boolean", nullable: false),
                    creado_en = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    actualizado_en = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("cuentas_contables_pkey", x => x.id);
                    table.UniqueConstraint("uq_cuentas_contables_id_agencia", x => new { x.id, x.agencia_id });
                    table.ForeignKey(
                        name: "cuentas_contables_agencia_id_fkey",
                        column: x => x.agencia_id,
                        principalSchema: "paqueteria",
                        principalTable: "agencias",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "partidas_contables",
                schema: "paqueteria",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    agencia_id = table.Column<long>(type: "bigint", nullable: false, defaultValueSql: "paqueteria.fn_agencia_actual()"),
                    asiento_id = table.Column<long>(type: "bigint", nullable: false),
                    cuenta_id = table.Column<long>(type: "bigint", nullable: false),
                    debe = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    haber = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    detalle = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("partidas_contables_pkey", x => x.id);
                    table.UniqueConstraint("uq_partidas_contables_id_agencia", x => new { x.id, x.agencia_id });
                    table.ForeignKey(
                        name: "fk_partidas_contables_asiento",
                        columns: x => new { x.asiento_id, x.agencia_id },
                        principalSchema: "paqueteria",
                        principalTable: "asientos_contables",
                        principalColumns: new[] { "id", "agencia_id" });
                    table.ForeignKey(
                        name: "fk_partidas_contables_cuenta",
                        columns: x => new { x.cuenta_id, x.agencia_id },
                        principalSchema: "paqueteria",
                        principalTable: "cuentas_contables",
                        principalColumns: new[] { "id", "agencia_id" });
                    table.ForeignKey(
                        name: "partidas_contables_agencia_id_fkey",
                        column: x => x.agencia_id,
                        principalSchema: "paqueteria",
                        principalTable: "agencias",
                        principalColumn: "id");
                });

            migrationBuilder.CreateIndex(
                name: "ix_asientos_contables_fecha",
                schema: "paqueteria",
                table: "asientos_contables",
                columns: new[] { "agencia_id", "fecha" });

            migrationBuilder.CreateIndex(
                name: "uq_asientos_contables_reversion",
                schema: "paqueteria",
                table: "asientos_contables",
                columns: new[] { "agencia_id", "reversion_de_id" },
                unique: true,
                filter: "reversion_de_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "uq_cuentas_contables_codigo",
                schema: "paqueteria",
                table: "cuentas_contables",
                columns: new[] { "agencia_id", "codigo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_partidas_contables_asiento",
                schema: "paqueteria",
                table: "partidas_contables",
                column: "asiento_id");

            migrationBuilder.CreateIndex(
                name: "ix_partidas_contables_cuenta",
                schema: "paqueteria",
                table: "partidas_contables",
                column: "cuenta_id");

            migrationBuilder.Sql(ContabilidadSql.Protecciones);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(ContabilidadSql.Revertir);

            migrationBuilder.DropTable(
                name: "partidas_contables",
                schema: "paqueteria");

            migrationBuilder.DropTable(
                name: "asientos_contables",
                schema: "paqueteria");

            migrationBuilder.DropTable(
                name: "cuentas_contables",
                schema: "paqueteria");
        }
    }
}
