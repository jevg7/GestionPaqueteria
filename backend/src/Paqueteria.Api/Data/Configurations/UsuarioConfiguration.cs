using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class UsuarioConfiguration : IEntityTypeConfiguration<Usuario>
{
    public void Configure(EntityTypeBuilder<Usuario> builder)
    {
        builder.ToTable("usuarios");
        builder.HasKey(u => u.Id).HasName("usuarios_pkey");

        builder.Property(u => u.AgenciaId).AgenciaDeLaSesion();
        builder.Property(u => u.Nombres).HasMaxLength(100);
        builder.Property(u => u.Apellidos).HasMaxLength(100);
        builder.Property(u => u.Correo).HasMaxLength(254);
        builder.Property(u => u.Telefono).HasMaxLength(30);
        builder.Property(u => u.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(u => u.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        // Destino de las FK compuestas (usuario_id, agencia_id): un usuario solo aparece en filas de su agencia.
        builder.HasAlternateKey(u => new { u.Id, u.AgenciaId }).HasName("uq_usuarios_id_agencia");
        builder.HasOne<Agencia>().WithMany()
            .HasForeignKey(u => u.AgenciaId)
            .HasConstraintName("usuarios_agencia_id_fkey");

        builder.HasIndex(u => u.AuthUserId).IsUnique().HasDatabaseName("usuarios_auth_user_id_key");
        builder.HasIndex(u => u.AgenciaId).HasDatabaseName("ix_usuarios_agencia");
        // uq_usuarios_correo es único sobre lower(correo): índice por expresión, solo en schema.sql.
    }
}
