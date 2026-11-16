class LineError(Exception):
    """An error attributable to a specific document line (or none)."""

    def __init__(self, message: str, line_id: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.line_id = line_id


class CompileTimeout(Exception):
    pass
