using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class RolConfiguration : IEntityTypeConfiguration<Rol>
{
    public void Configure(EntityTypeBuilder<Rol> builder)
    {
        builder.ToTable("roles");
        builder.HasKey(r => r.Id).HasName("roles_pkey");

        builder.Property(r => r.Codigo).HasMaxLength(30);
        builder.Property(r => r.Nombre).HasMaxLength(60);

        builder.HasIndex(r => r.Codigo).IsUnique().HasDatabaseName("roles_codigo_key");
    }
}
