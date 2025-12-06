#!/usr/bin/env python3
"""
Lidarr-specific API functions
Handles all communication with the Lidarr API (v1)

This module has been refactored to use the base API client, tag manager,
and pagination helpers to eliminate code duplication across *arr apps.
"""

import time
from typing import Any

import requests

# Import base modules for shared functionality
from src.primary.apps.base.api_client import ArrAPIClient
from src.primary.apps.base.pagination import PaginationHelper
from src.primary.apps.base.tag_manager import TagManager
from src.primary.settings_manager import get_ssl_verify_setting
from src.primary.utils.logger import get_logger

# Get logger for the Lidarr app
lidarr_logger = get_logger("lidarr")

# Initialize base client, tag manager, and pagination helper (Lidarr uses API v1)
_api_client = ArrAPIClient("lidarr", api_version="v1", logger=lidarr_logger)
_tag_manager = TagManager(_api_client, entity_type="artist")
_pagination_helper = PaginationHelper(_api_client)

# Keep session reference for backward compatibility with direct requests
session = _api_client.session

def arr_request(api_url: str, api_key: str, api_timeout: int, endpoint: str, method: str = "GET", data: dict | None = None, params: dict | None = None, count_api: bool = True) -> Any:
    """
    Make a request to the Lidarr API.

    This is a thin wrapper around ArrAPIClient.request() for backward compatibility.

    Args:
        api_url: The base URL of the Lidarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        endpoint: The API endpoint to call
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Data to send in the request body (for POST/PUT)
        params: Query parameters
        count_api: Whether to count this request toward the hourly API cap

    Returns:
        The parsed JSON response or None if the request failed
    """
    return _api_client.request(api_url, api_key, api_timeout, endpoint, method, data, params=params, count_api=count_api)

# --- Specific API Functions ---

def get_system_status(api_url: str, api_key: str, api_timeout: int, verify_ssl: bool | None = None) -> dict:
    """
    Get Lidarr system status.

    Args:
        api_url: The base URL of the Lidarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        verify_ssl: Optional override for SSL verification

    Returns:
        System status information or empty dict if request failed
    """
    # If verify_ssl is not provided, get it from settings
    if verify_ssl is None:
        verify_ssl = get_ssl_verify_setting()

    # Log whether SSL verification is being used
    if not verify_ssl:
        lidarr_logger.debug("SSL verification disabled for system status check")

    try:
        # For Lidarr, use V1 API
        endpoint = f"{api_url.rstrip('/')}/api/v1/system/status"
        headers = {"X-Api-Key": api_key}

        # Execute the request with SSL verification setting
        response = requests.get(endpoint, headers=headers, timeout=api_timeout, verify=verify_ssl)
        response.raise_for_status()

        # Parse and return the result
        return response.json()
    except Exception as e:
        lidarr_logger.error(f"Error getting system status: {e!s}")
        return {}

def check_connection(api_url: str, api_key: str, api_timeout: int) -> bool:
    """
    Check connection to the Lidarr API by fetching system status.

    This is a thin wrapper around ArrAPIClient.check_connection().
    """
    return _api_client.check_connection(api_url, api_key, api_timeout)

def get_artists(api_url: str, api_key: str, api_timeout: int, artist_id: int | None = None) -> list | dict | None:
    """Get artist information from Lidarr."""
    endpoint = f"artist/{artist_id}" if artist_id else "artist"
    return arr_request(api_url, api_key, api_timeout, endpoint, count_api=False)

def get_albums(api_url: str, api_key: str, api_timeout: int, album_id: int | None = None, artist_id: int | None = None) -> list | dict | None:
    """Get album information from Lidarr."""
    params = {}
    if artist_id:
        params['artistId'] = artist_id

    if album_id:
        endpoint = f"album/{album_id}"
    else:
        endpoint = "album"

    return arr_request(api_url, api_key, api_timeout, endpoint, params=params if params else None, count_api=False)

def get_tracks(api_url: str, api_key: str, api_timeout: int, album_id: int | None = None) -> list | None:
     """Get track information for a specific album."""
     if not album_id:
         lidarr_logger.warning("get_tracks requires an album_id.")
         return None
     params = {'albumId': album_id}
     return arr_request(api_url, api_key, api_timeout, "track", params=params, count_api=False)

def get_queue(api_url: str, api_key: str, api_timeout: int) -> list:
    """Get the current queue from Lidarr (handles pagination)."""
    # Lidarr v1 queue endpoint supports pagination, unlike Sonarr v3's simple list
    all_records = []
    page = 1
    page_size = 1000 # Request large page size

    while True:
        params = {
            "page": page,
            "pageSize": page_size,
            "sortKey": "timeleft", # Example sort key
            "sortDir": "asc"
        }
        response = arr_request(api_url, api_key, api_timeout, "queue", params=params, count_api=False)

        if response and isinstance(response, dict) and 'records' in response:
            records = response.get('records', [])
            if not records:
                break # No more records
            all_records.extend(records)

            # Check if this was the last page
            total_records = response.get('totalRecords', 0)
            if len(all_records) >= total_records:
                break

            page += 1
        else:
            lidarr_logger.error(f"Failed to get queue page {page} or invalid response format.")
            break # Return what we have so far

    return all_records

def get_download_queue_size(api_url: str, api_key: str, api_timeout: int) -> int:
    """
    Get the current size of the Lidarr download queue.

    This is a thin wrapper around ArrAPIClient.get_download_queue_size().
    """
    return _api_client.get_download_queue_size(api_url, api_key, api_timeout)

def get_missing_albums(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict[str, Any]]:
    """Get missing albums from Lidarr, handling pagination."""
    endpoint = "wanted/missing"
    page = 1
    page_size = 1000
    all_missing_albums = []
    total_records_reported = -1

    lidarr_logger.debug(f"Starting fetch for missing albums (monitored_only={monitored_only}).")

    while True:
        params = {
            "page": page,
            "pageSize": page_size,
            "includeArtist": "true" # Include artist info for filtering
            # Removed sortKey and sortDir
        }

        lidarr_logger.debug(f"Requesting missing albums page {page} with params: {params}")
        response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

        if response and isinstance(response, dict) and 'records' in response:
            records = response.get('records', [])
            total_records_on_page = len(records)

            if page == 1:
                total_records_reported = response.get('totalRecords', 0)
                lidarr_logger.debug(f"Lidarr API reports {total_records_reported} total missing albums.")

            lidarr_logger.debug(f"Parsed {total_records_on_page} missing album records from Lidarr API JSON (page {page}).")

            if not records:
                lidarr_logger.debug(f"No more missing records found on page {page}. Stopping pagination.")
                break

            all_missing_albums.extend(records)

            if total_records_reported >= 0 and len(all_missing_albums) >= total_records_reported:
                lidarr_logger.debug(f"Fetched {len(all_missing_albums)} records, matching or exceeding total reported ({total_records_reported}). Assuming last page.")
                break

            if total_records_on_page < page_size:
                lidarr_logger.debug(f"Received {total_records_on_page} records (less than page size {page_size}). Assuming last page.")
                break

            page += 1
            # time.sleep(0.1) # Optional delay

        else:
            lidarr_logger.error(f"Failed to get missing albums page {page} or invalid response format.")
            break # Return what we have so far

    lidarr_logger.info(f"Total missing albums fetched across all pages: {len(all_missing_albums)}")

    # Apply monitored filter after fetching
    if monitored_only:
        original_count = len(all_missing_albums)
        # Check both album and artist monitored status
        filtered_missing = [
            album for album in all_missing_albums
            if album.get('monitored', False) and album.get('artist', {}).get('monitored', False)
        ]
        lidarr_logger.debug(f"Filtered for monitored_only=True: {len(filtered_missing)} monitored missing albums remain (out of {original_count} total).")
        return filtered_missing
    else:
        lidarr_logger.debug(f"Returning {len(all_missing_albums)} missing albums (monitored_only=False).")
        return all_missing_albums

def get_cutoff_unmet_albums(api_url: str, api_key: str, api_timeout: int, monitored_only: bool) -> list[dict[str, Any]]:
    """Get cutoff unmet albums from Lidarr, handling pagination."""
    # Note: Lidarr API returns ALBUMS for cutoff unmet, not tracks.
    endpoint = "wanted/cutoff"
    page = 1
    page_size = 1000 # Adjust page size if needed, Lidarr default might be smaller
    all_cutoff_unmet = []
    total_records_reported = -1

    lidarr_logger.debug(f"Starting fetch for cutoff unmet albums (monitored_only={monitored_only}).")

    while True:
        params = {
            "page": page,
            "pageSize": page_size,
            "includeArtist": "true" # Include artist info for filtering
            # Removed sortKey and sortDir
        }

        lidarr_logger.debug(f"Requesting cutoff unmet albums page {page} with params: {params}")
        response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

        if response and isinstance(response, dict) and 'records' in response:
            records = response.get('records', [])
            total_records_on_page = len(records)

            if page == 1:
                total_records_reported = response.get('totalRecords', 0)
                lidarr_logger.debug(f"Lidarr API reports {total_records_reported} total cutoff unmet albums.")

            lidarr_logger.debug(f"Parsed {total_records_on_page} cutoff unmet album records from Lidarr API JSON (page {page}).")

            if not records:
                lidarr_logger.debug(f"No more cutoff unmet records found on page {page}. Stopping pagination.")
                break

            all_cutoff_unmet.extend(records)

            # Check if we have fetched all reported records
            if total_records_reported >= 0 and len(all_cutoff_unmet) >= total_records_reported:
                lidarr_logger.debug(f"Fetched {len(all_cutoff_unmet)} records, matching or exceeding total reported ({total_records_reported}). Assuming last page.")
                break

            # Check if the number of records received is less than the page size
            if total_records_on_page < page_size:
                lidarr_logger.debug(f"Received {total_records_on_page} records (less than page size {page_size}). Assuming last page.")
                break

            page += 1
            # time.sleep(0.1) # Optional small delay between pages

        else:
            # Log the error based on the response received (handled in arr_request)
            lidarr_logger.error(f"Error getting cutoff unmet albums from Lidarr (page {page}) or invalid response format. Stopping pagination.")
            # Return what we have so far, or indicate complete failure? Let's return what we have.
            break

    lidarr_logger.info(f"Total cutoff unmet albums fetched across all pages: {len(all_cutoff_unmet)}")

    # Apply monitored filter after fetching all pages
    if monitored_only:
        original_count = len(all_cutoff_unmet)
        # Check both album and artist monitored status
        filtered_cutoff_unmet = [
            album for album in all_cutoff_unmet
            if album.get('monitored', False) and album.get('artist', {}).get('monitored', False)
        ]
        lidarr_logger.debug(f"Filtered for monitored_only=True: {len(filtered_cutoff_unmet)} monitored cutoff unmet albums remain (out of {original_count} total).")
        return filtered_cutoff_unmet
    else:
        lidarr_logger.debug(f"Returning {len(all_cutoff_unmet)} cutoff unmet albums (monitored_only=False).")
        return all_cutoff_unmet

def search_albums(api_url: str, api_key: str, api_timeout: int, album_ids: list[int]) -> dict | None:
    """Trigger a search for specific albums in Lidarr."""
    if not album_ids:
        lidarr_logger.warning("No album IDs provided for search.")
        return None

    # Check API limit before making request
    try:
        from src.primary.stats_manager import check_hourly_cap_exceeded
        if check_hourly_cap_exceeded("lidarr"):
            lidarr_logger.warning(f"🛑 Lidarr API hourly limit reached - skipping album search for {len(album_ids)} albums")
            return None
    except Exception as e:
        lidarr_logger.error(f"Error checking hourly API cap: {e}")
        # Continue with request if cap check fails - safer than skipping

    payload = {
        "name": "AlbumSearch",
        "albumIds": album_ids
    }
    response = arr_request(api_url, api_key, api_timeout, "command", method="POST", data=payload)

    if response and isinstance(response, dict) and 'id' in response:
        command_id = response.get('id')
        lidarr_logger.info(f"Triggered Lidarr AlbumSearch for album IDs: {album_ids}. Command ID: {command_id}")

        # Increment API counter after successful request
        try:
            from src.primary.stats_manager import increment_hourly_cap
            increment_hourly_cap("lidarr", 1)
            lidarr_logger.debug(f"Incremented Lidarr hourly API cap for album search ({len(album_ids)} albums)")
        except Exception as cap_error:
            lidarr_logger.error(f"Failed to increment hourly API cap for album search: {cap_error}")

        return response # Return the full command object including ID
    else:
        lidarr_logger.error(f"Failed to trigger Lidarr AlbumSearch for album IDs {album_ids}. Response: {response}")
        return None

def search_artist(api_url: str, api_key: str, api_timeout: int, artist_id: int) -> dict | None:
    """Trigger a search for a specific artist in Lidarr."""

    # Check API limit before making request
    try:
        from src.primary.stats_manager import check_hourly_cap_exceeded
        if check_hourly_cap_exceeded("lidarr"):
            lidarr_logger.warning(f"🛑 Lidarr API hourly limit reached - skipping artist search for artist {artist_id}")
            return None
    except Exception as e:
        lidarr_logger.error(f"Error checking hourly API cap: {e}")
        # Continue with request if cap check fails - safer than skipping

    payload = {
        "name": "ArtistSearch",
        "artistIds": [artist_id]
    }
    response = arr_request(api_url, api_key, api_timeout, "command", method="POST", data=payload)

    if response and isinstance(response, dict) and 'id' in response:
        command_id = response.get('id')
        lidarr_logger.info(f"Triggered Lidarr ArtistSearch for artist ID: {artist_id}. Command ID: {command_id}")

        # Increment API counter after successful request
        try:
            from src.primary.stats_manager import increment_hourly_cap
            increment_hourly_cap("lidarr", 1)
            lidarr_logger.debug(f"Incremented Lidarr hourly API cap for artist search (artist {artist_id})")
        except Exception as cap_error:
            lidarr_logger.error(f"Failed to increment hourly API cap for artist search: {cap_error}")

        return response # Return the full command object
    else:
        lidarr_logger.error(f"Failed to trigger Lidarr ArtistSearch for artist ID {artist_id}. Response: {response}")
        return None

def refresh_artist(api_url: str, api_key: str, api_timeout: int, artist_id: int) -> dict | None:
    """Refresh functionality has been removed as it was a performance bottleneck.
    This function now returns a placeholder success value without making any API calls."""
    lidarr_logger.debug(f"Refresh functionality disabled for artist ID: {artist_id}")
    # Return a placeholder command object to simulate success
    return {
        'id': 123,
        'name': 'RefreshArtist',
        'status': 'completed',
        'artistId': artist_id,
        'message': 'Refresh functionality disabled for performance reasons'
    }

def get_command_status(api_url: str, api_key: str, api_timeout: int, command_id: int) -> dict[str, Any] | None:
    """Get the status of a Lidarr command."""
    response = arr_request(api_url, api_key, api_timeout, f"command/{command_id}")
    if response and isinstance(response, dict):
        lidarr_logger.debug(f"Checked Lidarr command status for ID {command_id}: {response.get('status')}")
        return response
    else:
         lidarr_logger.error(f"Error getting Lidarr command status for ID {command_id}. Response: {response}")
         return None

def get_artist_by_id(api_url: str, api_key: str, api_timeout: int, artist_id: int) -> dict[str, Any] | None:
    """Get artist details by ID from Lidarr."""
    return arr_request(api_url, api_key, api_timeout, f"artist/{artist_id}")

def get_or_create_tag(api_url: str, api_key: str, api_timeout: int, tag_label: str) -> int | None:
    """
    Get existing tag ID or create a new tag in Lidarr.

    This is a thin wrapper around TagManager.get_or_create_tag().
    """
    return _tag_manager.get_or_create_tag(api_url, api_key, api_timeout, tag_label)


def add_tag_to_artist(api_url: str, api_key: str, api_timeout: int, artist_id: int, tag_id: int) -> bool:
    """
    Add a tag to an artist in Lidarr.

    This is a thin wrapper around TagManager.add_tag_to_entity().
    """
    return _tag_manager.add_tag_to_entity(api_url, api_key, api_timeout, artist_id, tag_id)


def tag_processed_artist(api_url: str, api_key: str, api_timeout: int, artist_id: int, tag_label: str = "huntarr-missing") -> bool:
    """
    Tag an artist in Lidarr with the specified tag.

    This is a thin wrapper around TagManager.tag_processed_entity().
    """
    return _tag_manager.tag_processed_entity(api_url, api_key, api_timeout, artist_id, tag_label)

def get_missing_albums_random_page(api_url: str, api_key: str, api_timeout: int, monitored_only: bool, count: int) -> list[dict[str, Any]]:
    """
    Get a specified number of random missing albums by selecting a random page.
    This is much more efficient for very large libraries.

    Args:
        api_url: The base URL of the Lidarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: Whether to include only monitored albums
        count: How many albums to return

    Returns:
        A list of randomly selected missing albums, up to the requested count
    """
    endpoint = "wanted/missing"
    page_size = 100  # Smaller page size for better performance
    retries = 2
    retry_delay = 3

    # First, make a request to get just the total record count (page 1 with size=1)
    params = {
        "page": 1,
        "pageSize": 1,
        "includeArtist": "true"  # Include artist info for filtering
    }

    for attempt in range(retries + 1):
        try:
            # Get total record count from a minimal query
            lidarr_logger.debug(f"Getting missing albums count (attempt {attempt+1}/{retries+1})")
            response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

            if not response or not isinstance(response, dict):
                lidarr_logger.warning(f"Invalid response when getting missing count (attempt {attempt+1})")
                if attempt < retries:
                    time.sleep(retry_delay)
                    continue
                return []

            total_records = response.get('totalRecords', 0)

            if total_records == 0:
                lidarr_logger.info("No missing albums found in Lidarr.")
                return []

            # Calculate total pages with our desired page size
            total_pages = (total_records + page_size - 1) // page_size
            lidarr_logger.info(f"Found {total_records} total missing albums across {total_pages} pages")

            if total_pages == 0:
                return []

            # Select a random page
            import random
            random_page = random.randint(1, total_pages)
            lidarr_logger.info(f"Selected random page {random_page} of {total_pages} for missing albums")

            # Get albums from the random page
            params = {
                "page": random_page,
                "pageSize": page_size,
                "includeArtist": "true"
            }

            response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

            if not response or not isinstance(response, dict):
                lidarr_logger.warning(f"Invalid response when getting missing albums page {random_page}")
                return []

            records = response.get('records', [])
            lidarr_logger.info(f"Retrieved {len(records)} missing albums from page {random_page}")

            # Apply monitored filter if requested
            if monitored_only:
                filtered_records = [
                    album for album in records
                    if album.get('monitored', False) and album.get('artist', {}).get('monitored', False)
                ]
                lidarr_logger.debug(f"Filtered to {len(filtered_records)} monitored missing albums")
                records = filtered_records

            # Select random albums from this page
            if len(records) > count:
                selected_records = random.sample(records, count)
                lidarr_logger.debug(f"Randomly selected {len(selected_records)} missing albums from page {random_page}")
                return selected_records
            else:
                # If we have fewer albums than requested, return all of them
                lidarr_logger.debug(f"Returning all {len(records)} missing albums from page {random_page} (fewer than requested {count})")
                return records

        except Exception as e:
            lidarr_logger.error(f"Error getting missing albums from Lidarr (attempt {attempt+1}): {e!s}")
            if attempt < retries:
                time.sleep(retry_delay)
                continue
            return []

    # If we get here, all retries failed
    lidarr_logger.error("All attempts to get missing albums failed")
    return []

def get_cutoff_unmet_albums_random_page(api_url: str, api_key: str, api_timeout: int, monitored_only: bool, count: int) -> list[dict[str, Any]]:
    """
    Get a specified number of random cutoff unmet albums by selecting a random page.
    This is much more efficient for very large libraries.

    Args:
        api_url: The base URL of the Lidarr API
        api_key: The API key for authentication
        api_timeout: Timeout for the API request
        monitored_only: Whether to include only monitored albums
        count: How many albums to return

    Returns:
        A list of randomly selected cutoff unmet albums
    """
    endpoint = "wanted/cutoff"
    page_size = 100  # Smaller page size for better performance
    retries = 2
    retry_delay = 3

    # First, make a request to get just the total record count (page 1 with size=1)
    params = {
        "page": 1,
        "pageSize": 1,
        "includeArtist": "true"  # Include artist info for filtering
    }

    for attempt in range(retries + 1):
        try:
            # Get total record count from a minimal query
            lidarr_logger.debug(f"Getting cutoff unmet albums count (attempt {attempt+1}/{retries+1})")
            response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

            if not response or not isinstance(response, dict):
                lidarr_logger.warning(f"Invalid response when getting cutoff unmet count (attempt {attempt+1})")
                if attempt < retries:
                    time.sleep(retry_delay)
                    continue
                return []

            total_records = response.get('totalRecords', 0)

            if total_records == 0:
                lidarr_logger.info("No cutoff unmet albums found in Lidarr.")
                return []

            # Calculate total pages with our desired page size
            total_pages = (total_records + page_size - 1) // page_size
            lidarr_logger.info(f"Found {total_records} total cutoff unmet albums across {total_pages} pages")

            if total_pages == 0:
                return []

            # Select a random page
            import random
            random_page = random.randint(1, total_pages)
            lidarr_logger.info(f"Selected random page {random_page} of {total_pages} for cutoff unmet albums")

            # Get albums from the random page
            params = {
                "page": random_page,
                "pageSize": page_size,
                "includeArtist": "true"
            }

            response = arr_request(api_url, api_key, api_timeout, endpoint, params=params, count_api=False)

            if not response or not isinstance(response, dict):
                lidarr_logger.warning(f"Invalid response when getting cutoff unmet albums page {random_page}")
                return []

            records = response.get('records', [])
            lidarr_logger.info(f"Retrieved {len(records)} cutoff unmet albums from page {random_page}")

            # Apply monitored filter if requested
            if monitored_only:
                filtered_records = [
                    album for album in records
                    if album.get('monitored', False) and album.get('artist', {}).get('monitored', False)
                ]
                lidarr_logger.debug(f"Filtered to {len(filtered_records)} monitored cutoff unmet albums")
                records = filtered_records

            # Select random albums from this page
            if len(records) > count:
                selected_records = random.sample(records, count)
                lidarr_logger.debug(f"Randomly selected {len(selected_records)} cutoff unmet albums from page {random_page}")
                return selected_records
            else:
                # If we have fewer albums than requested, return all of them
                lidarr_logger.debug(f"Returning all {len(records)} cutoff unmet albums from page {random_page} (fewer than requested {count})")
                return records

        except Exception as e:
            lidarr_logger.error(f"Error getting cutoff unmet albums from Lidarr (attempt {attempt+1}): {e!s}")
            if attempt < retries:
                time.sleep(retry_delay)
                continue
            return []

    # If we get here, all retries failed
    lidarr_logger.error("All attempts to get cutoff unmet albums failed")
    return []

def get_quality_profiles(api_url: str, api_key: str, api_timeout: int) -> list[dict] | None:
    """
    Get all quality profiles configured in Lidarr.

    This is a thin wrapper around ArrAPIClient.get_quality_profiles().
    """
    return _api_client.get_quality_profiles(api_url, api_key, api_timeout)
