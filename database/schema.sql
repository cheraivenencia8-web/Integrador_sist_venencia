CREATE TABLE IF NOT EXISTS categorias (
  id_categoria BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  cuota DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_categoria_cuota CHECK (cuota >= 0),
  UNIQUE KEY uq_categoria_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('ADMIN','OPERADOR') NOT NULL DEFAULT 'OPERADOR',
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS socios (
  id_socio BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_categoria BIGINT UNSIGNED NOT NULL,
  creado_por_usuario BIGINT UNSIGNED NOT NULL,
  dni_cifrado VARBINARY(512) NOT NULL,
  dni_iv BINARY(12) NOT NULL,
  dni_tag BINARY(16) NOT NULL,
  dni_hash BINARY(32) NOT NULL UNIQUE,
  nombre_apellido VARCHAR(140) NOT NULL,
  email_cifrado VARBINARY(512) NULL,
  email_iv BINARY(12) NULL,
  email_tag BINARY(16) NULL,
  fecha_alta DATE NOT NULL,
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_socio_categoria FOREIGN KEY (id_categoria)
    REFERENCES categorias(id_categoria),
  CONSTRAINT fk_socio_usuario FOREIGN KEY (creado_por_usuario)
    REFERENCES usuarios(id_usuario),
  INDEX idx_socio_categoria (id_categoria),
  INDEX idx_socio_estado (estado),
  INDEX idx_socio_nombre (nombre_apellido)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auditoria (
  id_auditoria BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario BIGINT UNSIGNED NOT NULL,
  accion VARCHAR(40) NOT NULL,
  entidad VARCHAR(40) NOT NULL,
  entidad_id BIGINT UNSIGNED NULL,
  resultado ENUM('OK','ERROR') NOT NULL,
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario),
  INDEX idx_auditoria_fecha (fecha),
  INDEX idx_auditoria_usuario (id_usuario)
) ENGINE=InnoDB;
