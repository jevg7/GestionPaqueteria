using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class UsuarioRolConfiguration : IEntityTypeConfiguration<UsuarioRol>
{
    public void Configure(EntityTypeBuilder<UsuarioRol> builder)
    {
        builder.ToTable("usuario_roles");
        builder.HasKey(ur => new { ur.UsuarioId, ur.RolId }).HasName("usuario_roles_pkey");

        builder.Property(ur => ur.AgenciaId).AgenciaDeLaSesion();
        builder.Property(ur => ur.AsignadoEn).FechaActualPorDefecto();

        builder.HasOne(ur => ur.Usuario).WithMany(u => u.Roles)
            .HasForeignKey(ur => new { ur.UsuarioId, ur.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_usuario_roles_usuario");
        builder.HasOne(ur => ur.Rol).WithMany(r => r.Usuarios)
            .HasForeignKey(ur => ur.RolId)
            .HasConstraintName("usuario_roles_rol_id_fkey");

        builder.HasIndex(ur => ur.RolId).HasDatabaseName("ix_usuario_roles_rol");
    }
}
