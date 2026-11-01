using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public sealed class ContabilidadCuentaConfiguration : IEntityTypeConfiguration<ContabilidadCuenta>
{
    public void Configure(EntityTypeBuilder<ContabilidadCuenta> builder)
    {
        builder.ToTable("cuentas_contables");
        builder.HasKey(c => c.Id).HasName("cuentas_contables_pkey");
        builder.Property(c => c.AgenciaId).AgenciaDeLaSesion();
        builder.Property(c => c.Codigo).HasMaxLength(20);
        builder.Property(c => c.Nombre).HasMaxLength(120);
        builder.Property(c => c.Tipo).HasConversion<UpperSnakeEnumConverter<TipoCuentaContable>>().HasMaxLength(20);
        builder.Property(c => c.Clasificacion).HasConversion<UpperSnakeEnumConverter<ClasificacionCuentaContable>>().HasMaxLength(20);
        builder.Property(c => c.Naturaleza).HasConversion<UpperSnakeEnumConverter<NaturalezaCuentaContable>>().HasMaxLength(20);
        builder.Property(c => c.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(c => c.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();
        builder.HasAlternateKey(c => new { c.Id, c.AgenciaId }).HasName("uq_cuentas_contables_id_agencia");
        builder.HasOne<Agencia>().WithMany().HasForeignKey(c => c.AgenciaId).HasConstraintName("cuentas_contables_agencia_id_fkey");
        builder.HasIndex(c => new { c.AgenciaId, c.Codigo }).IsUnique().HasDatabaseName("uq_cuentas_contables_codigo");
    }
}
