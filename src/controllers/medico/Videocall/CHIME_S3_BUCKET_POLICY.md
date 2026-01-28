# Grabación de videoconsultas (Chime + S3)

Si aparece el error **"The bucket policy does not exist"** al crear una reunión, el bucket S3 debe tener la política que Chime requiere.

## Configurar el bucket S3 para Chime

Para que Chime pueda grabar en tu bucket S3, el bucket debe tener una **política** que permita al servicio Chime escribir en él.

1. En AWS Console → S3 → tu bucket (ej. `crisalia-storage`).
2. Pestaña **Permissions** → **Bucket policy** → **Edit**.
3. Añade una política como la siguiente (sustituye `TU_ACCOUNT_ID` por tu ID de cuenta AWS y `NOMBRE_BUCKET` por el nombre del bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AWSChimeMediaCaptureBucketPolicy",
      "Effect": "Allow",
      "Principal": {
        "Service": "mediapipelines.chime.amazonaws.com"
      },
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::NOMBRE_BUCKET/*",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "TU_ACCOUNT_ID"
        },
        "ArnLike": {
          "aws:SourceArn": "arn:aws:chime:*:TU_ACCOUNT_ID:*"
        }
      }
    }
  ]
}
```

4. El bucket debe estar en la **misma región** que usas para Chime (ej. `us-east-1`).
5. Tu usuario/rol IAM debe tener permisos sobre ese bucket (por ejemplo `s3:PutObject`, `s3:GetObject` en el bucket).

Documentación oficial: [Setting Amazon S3 bucket permissions for Amazon Chime SDK media pipelines](https://docs.aws.amazon.com/chime-sdk/latest/dg/s3-permissions.html)
