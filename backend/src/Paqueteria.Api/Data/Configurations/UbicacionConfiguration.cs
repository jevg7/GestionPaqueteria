using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class UbicacionConfiguration : IEntityTypeConfiguration<Ubicacion>
{
    public void Configure(EntityTypeBuilder<Ubicacion> builder)
    {
        builder.ToTable("ubicaciones");
        builder.HasKey(u => u.Id).HasName("ubicaciones_pkey");

        builder.Property(u => u.AgenciaId).AgenciaDeLaSesion();
        builder.Property(u => u.Codigo).HasMaxLength(10);
        builder.Property(u => u.Nombre).HasMaxLength(100);
        builder.Property(u => u.Pais).HasMaxLength(2).IsFixedLength();

        builder.HasAlternateKey(u => new { u.Id, u.AgenciaId }).HasName("uq_ubicaciones_id_agencia");
        builder.HasOne<Agencia>().WithMany()
            .HasForeignKey(u => u.AgenciaId)
            .HasConstraintName("ubicaciones_agencia_id_fkey");

        builder.HasIndex(u => new { u.AgenciaId, u.Codigo }).IsUnique().HasDatabaseName("uq_ubicaciones_codigo");
    }
}
