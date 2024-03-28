

export const response = (statusCode: number) => (
    {
        statusCode: statusCode,
        body: statusCode == 200 ? 'success': 'failure'
    }
)