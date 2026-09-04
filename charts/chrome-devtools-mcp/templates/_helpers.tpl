{{/*
ChromeDevTools MCP — helpers communs
*/}}

{{/*
Créer un nom court à partir du nom Helm (max 63 chars, RFC 1123).
*/}}
{{- define "chrome-devtools-mcp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Sélecteur de labels — stable entre les upgrades.
*/}}
{{- define "chrome-devtools-mcp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chrome-devtools-mcp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Labels communs.
*/}}
{{- define "chrome-devtools-mcp.labels" -}}
{{ include "chrome-devtools-mcp.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
