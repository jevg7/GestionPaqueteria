using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class CorrelativoConfiguration : IEntityTypeConfiguration<Correlativo>
{
    public void Configure(EntityTypeBuilder<Correlativo> builder)
    {
        builder.ToTable("correlativos");
        builder.HasKey(c => new { c.AgenciaId, c.Clave }).HasName("correlativos_pkey");

        // Parte de la clave: EF no puede tratarla como generada por la BD. El backend no escribe aquí.
        builder.Property(c => c.AgenciaId).HasDefaultValueSql("paqueteria.fn_agencia_actual()").ValueGeneratedNever();
        builder.Property(c => c.Clave).HasMaxLength(30);
        builder.Property(c => c.ActualizadoEn).FechaActualPorDefecto();

        builder.HasOne<Agencia>().WithMany()
            .HasForeignKey(c => c.AgenciaId)
            .HasConstraintName("correlativos_agencia_id_fkey");
    }
}
