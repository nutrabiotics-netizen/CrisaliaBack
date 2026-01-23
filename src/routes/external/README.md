# APIs Externas - Documentación

Este módulo proporciona endpoints de solo lectura (GET) para que servidores externos consuman datos de Crisalia.

## Autenticación

Todas las rutas requieren autenticación mediante un token externo. El token debe enviarse en el header de la petición:

```
Authorization: Bearer <EXTERNAL_API_TOKEN>
```

O alternativamente:

```
X-External-Token: <EXTERNAL_API_TOKEN>
```

El token se configura en la variable de entorno `EXTERNAL_API_TOKEN` en el archivo `.env`.

## Endpoints Disponibles

### 📋 Pacientes

#### `GET /api/external/pacientes`
Obtiene todos los pacientes activos.

**Respuesta:**
```json
{
  "success": true,
  "data": [...],
  "total": 10
}
```

#### `GET /api/external/pacientes/:id`
Obtiene un paciente específico por su ID.

---

### 👨‍⚕️ Médicos

#### `GET /api/external/medicos`
Obtiene todos los médicos activos.

#### `GET /api/external/medicos/:id`
Obtiene un médico específico por su ID.

#### `GET /api/external/medicos/:medicoId/disponibilidad`
Obtiene la configuración de disponibilidad/agenda de un médico específico.

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "medico": {...},
    "configuracion": {...},
    "tieneConfiguracion": true
  }
}
```

#### `GET /api/external/medicos/:medicoId/estadisticas-citas`
Obtiene estadísticas detalladas de citas de un médico.

**Query Parameters:**
- `fechaInicio` (opcional): Fecha de inicio del rango
- `fechaFin` (opcional): Fecha de fin del rango

**Respuesta incluye:**
- Total de citas
- Citas por estado (pendiente, confirmada, cancelada, completada)
- Citas por tipo (preconsulta, consulta, control)
- Citas por modalidad (presencial, virtual)
- Porcentajes de completadas y canceladas
- Estadísticas por mes (últimos 6 meses si no hay filtro de fecha)

#### `GET /api/external/medicos/:medicoId/cantidad-citas`
Obtiene la cantidad de citas de un médico (resumen simple).

**Query Parameters:**
- `fechaInicio` (opcional): Fecha de inicio del rango
- `fechaFin` (opcional): Fecha de fin del rango
- `estado` (opcional): Filtrar por estado

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "medico": {...},
    "cantidadCitas": 25,
    "filtros": {...}
  }
}
```

---

### 📅 Citas

#### `GET /api/external/citas`
Obtiene todas las citas. Admite filtros opcionales mediante query parameters.

**Query Parameters:**
- `fechaInicio` (opcional): Fecha de inicio del rango (formato ISO)
- `fechaFin` (opcional): Fecha de fin del rango (formato ISO)
- `estado` (opcional): Filtrar por estado (`pendiente`, `confirmada`, `cancelada`, `completada`)

**Ejemplo:**
```
GET /api/external/citas?fechaInicio=2026-01-01&fechaFin=2026-01-31&estado=confirmada
```

#### `GET /api/external/citas/:id`
Obtiene una cita específica por su ID.

#### `GET /api/external/citas/medico/:medicoId`
Obtiene todas las citas de un médico específico (con filtros opcionales).

#### `GET /api/external/citas/paciente/:pacienteId`
Obtiene todas las citas de un paciente específico (con filtros opcionales).

---

### 🏥 Historias Clínicas

#### `GET /api/external/historias-clinicas`
Obtiene todas las historias clínicas. Admite filtros opcionales.

**Query Parameters:**
- `fechaInicio` (opcional): Fecha de inicio del rango
- `fechaFin` (opcional): Fecha de fin del rango
- `pacienteId` (opcional): Filtrar por paciente
- `medicoId` (opcional): Filtrar por médico

#### `GET /api/external/historias-clinicas/:id`
Obtiene una historia clínica específica por su ID.

#### `GET /api/external/historias-clinicas/paciente/:pacienteId`
Obtiene todas las historias clínicas de un paciente específico.

#### `GET /api/external/historias-clinicas/medico/:medicoId`
Obtiene todas las historias clínicas de un médico específico.

#### `GET /api/external/historias-clinicas/cita/:citaId`
Obtiene la historia clínica asociada a una cita específica.

---

### 💊 Fórmulas Médicas

#### `GET /api/external/formulas-medicas`
Obtiene todas las fórmulas médicas. Admite filtros opcionales.

**Query Parameters:**
- `fechaInicio` (opcional): Fecha de inicio del rango
- `fechaFin` (opcional): Fecha de fin del rango
- `pacienteId` (opcional): Filtrar por paciente
- `medicoId` (opcional): Filtrar por médico

#### `GET /api/external/formulas-medicas/:id`
Obtiene una fórmula médica específica por su ID.

#### `GET /api/external/formulas-medicas/paciente/:pacienteId`
Obtiene todas las fórmulas médicas de un paciente específico.

#### `GET /api/external/formulas-medicas/cita/:citaId`
Obtiene la fórmula médica asociada a una cita específica.

---

### 📝 Interrogatorios

#### `GET /api/external/interrogatorios/paciente/:pacienteId`
Obtiene todos los interrogatorios de un paciente específico.

**Query Parameters:**
- `tipo` (opcional): Filtrar por tipo (`primera_vez`, `control`)
- `estado` (opcional): Filtrar por estado (`en_proceso`, `completado`, `pendiente`)

#### `GET /api/external/interrogatorios/:id`
Obtiene un interrogatorio específico por su ID.

---
 
## Ejemplos de Uso

```bash
# Obtener todos los pacientes
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  http://localhost:4000/api/external/pacientes

# Obtener citas de un médico con filtros
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/citas/medico/507f1f77bcf86cd799439011?fechaInicio=2026-01-01&estado=confirmada"

# Obtener historias clínicas de un paciente
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/historias-clinicas/paciente/507f1f77bcf86cd799439012"

# Buscar códigos CUPS2026
curl -H "X-External-Token: external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/cups2026?nombre=consulta&limit=10"

# Obtener fórmulas médicas de un paciente
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/formulas-medicas/paciente/507f1f77bcf86cd799439012"

# Obtener disponibilidad de un médico
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/medicos/507f1f77bcf86cd799439011/disponibilidad"

# Obtener estadísticas de citas de un médico
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/medicos/507f1f77bcf86cd799439011/estadisticas-citas?fechaInicio=2026-01-01"

# Obtener cantidad de citas de un médico
curl -H "Authorization: Bearer external_crisalia_secure_token_2026_xyz123" \
  "http://localhost:4000/api/external/medicos/507f1f77bcf86cd799439011/cantidad-citas?estado=confirmada"
```

## Notas Importantes

1. **Solo lectura**: Todos los endpoints son de solo lectura (GET). No se permiten operaciones de escritura (POST, PUT, DELETE).

2. **Datos sensibles**: Las contraseñas de usuarios nunca se incluyen en las respuestas.

3. **Pacientes y médicos activos**: Por defecto, solo se devuelven pacientes y médicos con `activo: true`.

4. **Población de datos**: Las citas, historias clínicas y fórmulas médicas incluyen información poblada de pacientes y médicos relacionados.

5. **Token de autenticación**: El token externo debe configurarse en la variable de entorno y debe mantenerse seguro.

6. **Filtros de fecha**: Los filtros de fecha aceptan formato ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss).

## Códigos de Estado HTTP

- `200`: Petición exitosa
- `401`: Token no proporcionado o inválido
- `404`: Recurso no encontrado
- `500`: Error interno del servidor

## Resumen de Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/external/pacientes` | Todos los pacientes |
| `GET /api/external/pacientes/:id` | Paciente por ID |
| `GET /api/external/medicos` | Todos los médicos |
| `GET /api/external/medicos/:id` | Médico por ID |
| `GET /api/external/medicos/:medicoId/disponibilidad` | Disponibilidad del médico |
| `GET /api/external/medicos/:medicoId/estadisticas-citas` | Estadísticas de citas del médico |
| `GET /api/external/medicos/:medicoId/cantidad-citas` | Cantidad de citas del médico |
| `GET /api/external/citas` | Todas las citas (con filtros) |
| `GET /api/external/citas/:id` | Cita por ID |
| `GET /api/external/citas/medico/:medicoId` | Citas por médico |
| `GET /api/external/citas/paciente/:pacienteId` | Citas por paciente |
| `GET /api/external/historias-clinicas` | Todas las historias clínicas |
| `GET /api/external/historias-clinicas/:id` | Historia clínica por ID |
| `GET /api/external/historias-clinicas/paciente/:pacienteId` | Historias por paciente |
| `GET /api/external/historias-clinicas/medico/:medicoId` | Historias por médico |
| `GET /api/external/historias-clinicas/cita/:citaId` | Historia por cita |
| `GET /api/external/formulas-medicas` | Todas las fórmulas médicas |
| `GET /api/external/formulas-medicas/:id` | Fórmula por ID |
| `GET /api/external/formulas-medicas/paciente/:pacienteId` | Fórmulas por paciente |
| `GET /api/external/formulas-medicas/cita/:citaId` | Fórmula por cita |
| `GET /api/external/interrogatorios/paciente/:pacienteId` | Interrogatorios por paciente |
| `GET /api/external/interrogatorios/:id` | Interrogatorio por ID |
| `GET /api/external/cups2026` | Buscar códigos CUPS2026 |
| `GET /api/external/cups2026/:codigo` | CUPS2026 por código |
