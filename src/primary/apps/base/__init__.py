"""
Base modules for shared *arr API functionality.

This package provides common abstractions used across all supported *arr applications
(Sonarr, Radarr, Lidarr, Readarr, Whisparr, Eros) to eliminate code duplication.

Modules:
    api_client: Core API request handling
    tag_manager: Tag creation and management
    pagination: Random page selection for large libraries
"""

from src.primary.apps.base.api_client import ArrAPIClient
from src.primary.apps.base.tag_manager import TagManager
from src.primary.apps.base.pagination import PaginationHelper

__all__ = ['ArrAPIClient', 'TagManager', 'PaginationHelper']
