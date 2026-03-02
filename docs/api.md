# API Reference

> **Note**: This documentation is currently under development. Comprehensive API documentation is coming soon.

## Overview

MiniDock provides a RESTful API for managing Docker containers, virtual machines, automation tasks, and system resources.

**Base URL**: `http://localhost:24000` (default)

## Authentication

All API endpoints (except `/auth/login` and `/auth/register`) require JWT authentication.

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**Response**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin"
  }
}
```

### Using the Token

Include the token in the `Authorization` header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Endpoints

### Docker Management

#### List Containers

```http
GET /docker/containers
```

#### Start Container

```http
POST /docker/containers/:id/start
```

#### Stop Container

```http
POST /docker/containers/:id/stop
```

#### View Logs

```http
GET /docker/containers/:id/logs?tail=100
```

### Virtual Machines

#### List VMs

```http
GET /vms
```

#### Create VM

```http
POST /vms
Content-Type: application/json

{
  "name": "Ubuntu Server",
  "cpu": 2,
  "memory": 4096,
  "disk": 20480
}
```

#### Start VM

```http
POST /vms/:id/start
```

### Automation

#### List Tasks

```http
GET /automation/tasks
```

#### Create Task

```http
POST /automation/tasks
Content-Type: application/json

{
  "name": "Backup Database",
  "trigger": {
    "type": "cron",
    "schedule": "0 2 * * *"
  },
  "action": {
    "type": "shell",
    "command": "backup.sh"
  }
}
```

### System

#### System Info

```http
GET /system/info
```

#### Disk Usage

```http
GET /system/disks
```

## WebSocket

MiniDock uses WebSocket for real-time updates.

**Endpoint**: `ws://localhost:24000/ws`

### Events

- `docker.container.status` - Container status changes
- `vm.status` - VM status changes
- `system.metrics` - System metrics updates
- `automation.task.run` - Task execution events

## Error Handling

All errors follow this format:

```json
{
  "error": true,
  "reason": "Error description"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Rate Limiting

Currently, there is no rate limiting. This may be added in future versions.

## Need Help?

- 💬 [GitHub Discussions](https://github.com/ironlab-dev/minidock/discussions)
- 🐛 [Report an Issue](https://github.com/ironlab-dev/minidock/issues)
- 📧 Email: minidock@ironlab.cc
