from app.homework.schemas import SubmissionIn

SUBMISSION_REQUEST = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["meta"],
                    "properties": {
                        "meta": {
                            "type": "string",
                            "description": "JSON сдачи. Сохраните id при повторе запроса. "
                            "Файлы передайте отдельными полями с UUID из taskFiles.",
                            "contentMediaType": "application/json",
                            "contentSchema": SubmissionIn.model_json_schema(by_alias=True),
                        }
                    },
                    "additionalProperties": {"type": "string", "format": "binary"},
                }
            }
        },
    }
}

HOMEWORK_FILE_REQUEST = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {"file": {"type": "string", "format": "binary"}},
                }
            }
        },
    }
}
