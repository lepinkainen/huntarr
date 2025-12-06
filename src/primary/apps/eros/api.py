#!/usr/bin/env python3
"""
Eros-specific API functions
Handles all communication with the Eros API

This module has been refactored to use the base API client, tag manager,
and pagination helpers to eliminate code duplication across *arr apps.
Exclusively uses the Eros API v3
"""

from typing import Any

# Import base modules for shared functionality
from src.primary.apps.base.api_client import ArrAPIClient
from src.primary.apps.base.pagination import PaginationHelper
from src.primary.apps.base.tag_manager import TagManager
from src.primary.utils.logger import get_logger

# Get logger for the Eros app
eros_logger = get_logger("eros")

# Initialize base client, tag manager, and pagination helper (Eros uses API v3 like Radarr)
_api_client = ArrAPIClient("eros", api_version="v3", logger=eros_logger)
_tag_manager = TagManager(_api_client, entity_type="movie")
_pagination_helper = PaginationHelper(_api_client)

# Keep session reference for backward compatibility with direct requests
session = _api_client.session

def arr_request(api_url: str, api_key: str, api_timeout: int, endpoint: str, method: str = "GET", data: dict | None = None, count_api: bool = True) -> Any:
    """
    Make a request to the Eros API.

    This is a thin wrapper around ArrAPIClient.request() for backward compatibility.

    Args:
        api_url: The base URL of the Eros API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        endpoint: The API endpoint to call
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Optional data payload for POST/PUT requests
        count_api: Whether to count this request toward the hourly API cap

    Returns:
        The parsed JSON response or None if the request failed
    """
    return _api_client.request(api_url, api_key, api_timeout, endpoint, method, data, count_api=count_api)


def get_download_queue_size(api_url: str, api_key: str, api_timeout: int) -> int:
    """
    Get the current size of the Eros download queue.

    This is a thin wrapper around ArrAPIClient.get_download_queue_size().
    """
    return _api_client.get_download_queue_size(api_url, api_key, api_timeout)

def get_items_with_missing(api_url: str, api_key: str, api_timeout: int, monitored_only: bool, search_mode: str = "movie") -> list[dict[str, Any]]:
    """
    Get a list of items with missing files (not downloaded/available).

    Args:
        api_url: The base URL of the Eros API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored items.
        search_mode: The search mode to use - 'movie' for movie-based or 'scene' for scene-based

    Returns:
        A list of item objects with missing files, or None if the request failed.
    """
    try:
        eros_logger.debug(f"Retrieving missing items using search mode: {search_mode}...")

        if search_mode == "movie":
            # In movie mode, we get all movies and filter for ones without files
            endpoint = "movie"

            response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

            if response is None:
                return None

            # Extract the movies with missing files
            items = []
            if isinstance(response, list):
                # Filter for movies that don't have files (hasFile = false)
                items = [item for item in response if not item.get("hasFile", True)]
            elif isinstance(response, dict) and "records" in response:
                # Fallback to old format if somehow it returns in this format
                items = [item for item in response["records"] if not item.get("hasFile", True)]

        elif search_mode == "scene":
            # In scene mode, we try to use scene-specific endpoints
            # First check if the movie-scene endpoint exists
            endpoint = "scene/missing?pageSize=1000"

            response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

            if response is None:
                # Fallback to regular movie filtering if scene endpoint doesn't exist
                eros_logger.warning("Scene endpoint not available, falling back to movie mode")
                return get_items_with_missing(api_url, api_key, api_timeout, monitored_only, "movie")

            # Extract the scenes
            items = []
            if isinstance(response, dict) and "records" in response:
                items = response["records"]
            elif isinstance(response, list):
                items = response

        else:
            # Invalid search mode
            eros_logger.error(f"Invalid search mode: {search_mode}. Must be 'movie' or 'scene'")
            return None

        # Filter monitored if needed
        if monitored_only:
            items = [item for item in items if item.get("monitored", False)]

        eros_logger.debug(f"Found {len(items)} missing items using {search_mode} mode")

        return items

    except Exception as e:
        eros_logger.error(f"Error retrieving missing items: {e!s}")
        return None

def get_cutoff_unmet_items(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict[str, Any]]:
    """
    Get a list of items that don't meet their quality profile cutoff.

    Args:
        api_url: The base URL of the Eros API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored items.

    Returns:
        A list of item objects that need quality upgrades, or None if the request failed.
    """
    try:
        eros_logger.debug("Retrieving cutoff unmet items...")

        # Endpoint
        endpoint = "wanted/cutoff?pageSize=1000&sortKey=airDateUtc&sortDirection=descending"

        response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

        if response is None:
            return None

        # Extract the episodes/items
        items = []
        if isinstance(response, dict) and "records" in response:
            items = response["records"]
        elif isinstance(response, list):
            items = response

        eros_logger.debug(f"Found {len(items)} cutoff unmet items")

        # Just filter monitored if needed
        if monitored_only:
            items = [item for item in items if item.get("monitored", False)]
            eros_logger.debug(f"Found {len(items)} cutoff unmet items after filtering monitored")

        return items

    except Exception as e:
        eros_logger.error(f"Error retrieving cutoff unmet items: {e!s}")
        return None

def get_quality_upgrades(api_url: str, api_key: str, api_timeout: int, monitored_only: bool, search_mode: str = "movie") -> list[dict[str, Any]]:
    """
    Get a list of items that can be upgraded to better quality.

    Args:
        api_url: The base URL of the Eros API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: If True, only return monitored items.
        search_mode: The search mode to use - 'movie' for movie-based or 'scene' for scene-based

    Returns:
        A list of item objects that need quality upgrades, or None if the request failed.
    """
    try:
        eros_logger.debug(f"Retrieving quality upgrade items using search mode: {search_mode}...")

        if search_mode == "movie":
            # In movie mode, we get all movies and filter for ones that have files but need quality upgrades
            endpoint = "movie"

            response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

            if response is None:
                return None

            # Extract movies that have files but need quality upgrades
            items = []
            if isinstance(response, list):
                # Filter for movies that have files but haven't met quality cutoff
                items = [item for item in response if item.get("hasFile", False) and item.get("qualityCutoffNotMet", False)]
            elif isinstance(response, dict) and "records" in response:
                # Fallback to old format if somehow it returns in this format
                items = [item for item in response["records"] if item.get("hasFile", False) and item.get("qualityCutoffNotMet", False)]

        elif search_mode == "scene":
            # In scene mode, try to use scene-specific endpoints
            endpoint = "scene/cutoff?pageSize=1000"

            response = arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

            if response is None:
                # Fallback to regular movie filtering if scene endpoint doesn't exist
                eros_logger.warning("Scene cutoff endpoint not available, falling back to movie mode")
                return get_quality_upgrades(api_url, api_key, api_timeout, monitored_only, "movie")

            # Extract the scenes
            items = []
            if isinstance(response, dict) and "records" in response:
                items = response["records"]
            elif isinstance(response, list):
                items = response

        else:
            # Invalid search mode
            eros_logger.error(f"Invalid search mode: {search_mode}. Must be 'movie' or 'scene'")
            return None

        # Filter monitored if needed
        if monitored_only:
            items = [item for item in items if item.get("monitored", False)]

        eros_logger.debug(f"Found {len(items)} quality upgrade items using {search_mode} mode")

        return items

    except Exception as e:
        eros_logger.error(f"Error retrieving quality upgrade items: {e!s}")
        return None

def refresh_item(api_url: str, api_key: str, api_timeout: int, item_id: int) -> int:
    """
    Refresh functionality has been removed as it was a performance bottleneck.
    This function now returns a placeholder command ID without making any API calls.

    Args:
        api_url: The base URL of the Whisparr V3 API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        item_id: The ID of the movie to refresh

    Returns:
        A placeholder command ID (123) to simulate success
    """
    eros_logger.debug(f"Refresh functionality disabled for movie ID: {item_id}")
    # Return a placeholder command ID to simulate success without actually refreshing
    return 123

def item_search(api_url: str, api_key: str, api_timeout: int, item_ids: list[int]) -> int:
    """
    Trigger a search for one or more movies in Whisparr V3.

    Args:
        api_url: The base URL of the Whisparr V3 API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        item_ids: A list of movie IDs to search for

    Returns:
        The command ID if the search command was triggered successfully, None otherwise
    """

    # Check API limit before making request
    try:
        from src.primary.stats_manager import check_hourly_cap_exceeded
        if check_hourly_cap_exceeded("eros"):
            eros_logger.warning(f"🛑 Eros API hourly limit reached - skipping item search for {len(item_ids)} items")
            return None
    except Exception as e:
        eros_logger.error(f"Error checking hourly API cap: {e}")
        # Continue with request if cap check fails - safer than skipping

    try:
        if not item_ids:
            eros_logger.warning("No movie IDs provided for search.")
            return None

        eros_logger.debug(f"Searching for movies with IDs: {item_ids}")

        # Try several possible command formats, as the API might be in flux
        possible_commands = [
            {"name": "MoviesSearch", "movieIds": item_ids},  # Standard movie search
            {"name": "MovieSearch", "movieIds": item_ids},   # Alternative format
            {"name": "EpisodeSearch", "episodeIds": item_ids}  # Fallback to episode format
        ]

        command_endpoint = "command"

        # Try each command format until one works
        for i, payload in enumerate(possible_commands):
            eros_logger.debug(f"Trying search command format {i+1}: {payload}")

            # Make the API request
            response = arr_request(api_url, api_key, api_timeout, command_endpoint, "POST", payload)

            if response and "id" in response:
                command_id = response["id"]
                eros_logger.debug(f"Search command format {i+1} succeeded with ID {command_id}")

                # Increment API counter after successful request
                try:
                    from src.primary.stats_manager import increment_hourly_cap
                    increment_hourly_cap("eros", 1)
                    eros_logger.debug(f"Incremented Eros hourly API cap for item search ({len(item_ids)} items)")
                except Exception as cap_error:
                    eros_logger.error(f"Failed to increment hourly API cap for item search: {cap_error}")

                return command_id

        # If we've tried all formats and none worked:
        eros_logger.error("All search command formats failed - no command ID returned")
        return None

    except Exception as e:
        eros_logger.error(f"Error searching for movies: {e!s}")
        return None

def get_command_status(api_url: str, api_key: str, api_timeout: int, command_id: int) -> dict | None:
    """
    Get the status of a specific command.

    Args:
        api_url: The base URL of the Eros API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        command_id: The ID of the command to check

    Returns:
        A dictionary containing the command status, or None if the request failed.
    """
    if not command_id:
        eros_logger.error("No command ID provided for status check.")
        return None

    try:
        command_endpoint = f"command/{command_id}"

        # Make the API request
        result = arr_request(api_url, api_key, api_timeout, command_endpoint, count_api=False)

        if result:
            eros_logger.debug(f"Command {command_id} status: {result.get('status', 'unknown')}")
            return result
        else:
            eros_logger.error(f"Failed to get command status for ID {command_id}")
            return None

    except Exception as e:
        eros_logger.error(f"Error getting command status for ID {command_id}: {e}")
        return None

def check_connection(api_url: str, api_key: str, api_timeout: int) -> bool:
    """
    Check the connection to Eros API.

    This is a thin wrapper around ArrAPIClient.check_connection().
    """
    return _api_client.check_connection(api_url, api_key, api_timeout)


def get_or_create_tag(api_url: str, api_key: str, api_timeout: int, tag_label: str) -> int | None:
    """
    Get existing tag ID or create a new tag in Eros.

    This is a thin wrapper around TagManager.get_or_create_tag().
    """
    return _tag_manager.get_or_create_tag(api_url, api_key, api_timeout, tag_label)


def add_tag_to_movie(api_url: str, api_key: str, api_timeout: int, movie_id: int, tag_id: int) -> bool:
    """
    Add a tag to a movie in Eros.

    This is a thin wrapper around TagManager.add_tag_to_entity().
    """
    return _tag_manager.add_tag_to_entity(api_url, api_key, api_timeout, movie_id, tag_id)


def tag_processed_movie(api_url: str, api_key: str, api_timeout: int, movie_id: int, tag_label: str = "huntarr-missing") -> bool:
    """
    Tag a movie in Eros with the specified tag.

    This is a thin wrapper around TagManager.tag_processed_entity().
    """
    return _tag_manager.tag_processed_entity(api_url, api_key, api_timeout, movie_id, tag_label)


def get_quality_profiles(api_url: str, api_key: str, api_timeout: int) -> list[dict] | None:
    """
    Get all quality profiles configured in Eros.

    This is a thin wrapper around ArrAPIClient.get_quality_profiles().
    """
    return _api_client.get_quality_profiles(api_url, api_key, api_timeout)
