#!/usr/bin/env python3
"""
Pagination and random page selection for *arr applications.

This module provides efficient pagination helpers for handling large libraries.
Instead of fetching all records (which can be slow for 10,000+ item libraries),
these helpers select random pages to ensure fair distribution while minimizing
API calls.

Previously duplicated functions (~800+ lines total):
- get_missing_episodes_random_page (Sonarr)
- get_cutoff_unmet_episodes_random_page (Sonarr)
- get_movies_with_missing_random_page (Radarr)
- get_cutoff_unmet_movies_random_page (Radarr)
- get_missing_albums_random_page (Lidarr)
- get_cutoff_unmet_albums_random_page (Lidarr)
- get_wanted_missing_books_random_page (Readarr)
- And more...
"""

import json
import random
import time
from collections.abc import Callable

from src.primary.apps.base.api_client import ArrAPIClient


class PaginationHelper:
    """
    Helper for efficient pagination and random page selection.

    This class consolidates the random page selection pattern used across
    all *arr applications for both missing content and quality upgrade searches.

    The approach:
    1. First fetch with pageSize=1 to get totalRecords
    2. Calculate total pages
    3. Select a random page
    4. Fetch only that page
    5. Optionally apply custom filters
    6. Return random sample of requested size

    This dramatically reduces API calls compared to fetching all pages.

    Attributes:
        api_client: The ArrAPIClient instance for making API requests
        logger: Logger instance inherited from api_client

    Example:
        >>> client = ArrAPIClient("sonarr", api_version="v3")
        >>> pagination = PaginationHelper(client)
        >>> episodes = pagination.get_random_page(
        ...     api_url, api_key, 30,
        ...     endpoint="wanted/missing",
        ...     count=10,
        ...     monitored_only=True
        ... )
    """

    def __init__(self, api_client: ArrAPIClient):
        """
        Initialize the pagination helper.

        Args:
            api_client: An ArrAPIClient instance for making requests
        """
        self.api_client = api_client
        self.logger = api_client.logger

    def get_random_page(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        endpoint: str,
        count: int,
        monitored_only: bool = True,
        page_size: int = 100,
        additional_params: dict | None = None,
        filter_func: Callable[[dict], bool] | None = None,
        max_retries: int = 2,
        retry_delay: int = 3,
        include_series: bool = False,
        include_artist: bool = False,
        include_author: bool = False
    ) -> list[dict]:
        """
        Get a random sample of records by selecting a random page.

        This method is much more efficient for large libraries than fetching
        all records. It works by:
        1. Getting the total record count with a minimal request
        2. Calculating total pages
        3. Selecting a random page
        4. Fetching only that page
        5. Applying custom filters if provided
        6. Returning a random sample

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request
            endpoint: The API endpoint (e.g., "wanted/missing", "wanted/cutoff")
            count: Maximum number of records to return
            monitored_only: Whether to filter for monitored items only
            page_size: Number of records per page (default 100)
            additional_params: Additional query parameters to include
            filter_func: Optional function to filter records (returns True to keep)
            max_retries: Number of retry attempts on failure
            retry_delay: Seconds to wait between retries
            include_series: Include series data in response (Sonarr)
            include_artist: Include artist data in response (Lidarr)
            include_author: Include author data in response (Readarr)

        Returns:
            List of records, or empty list on failure
        """
        for attempt in range(max_retries + 1):
            try:
                # Step 1: Get total record count with minimal query
                count_params = {
                    'page': 1,
                    'pageSize': 1,
                    'monitored': monitored_only
                }

                # Add include flags for nested data
                if include_series:
                    count_params['includeSeries'] = 'true'
                if include_artist:
                    count_params['includeArtist'] = 'true'
                if include_author:
                    count_params['includeAuthor'] = 'true'

                if additional_params:
                    count_params.update(additional_params)

                self.logger.debug(f"Getting record count (attempt {attempt+1}/{max_retries+1})")
                response = self.api_client.request(
                    api_url, api_key, api_timeout,
                    endpoint,
                    params=count_params,
                    count_api=False
                )

                if not response or not isinstance(response, dict):
                    self.logger.warning(f"Invalid response when getting count (attempt {attempt+1})")
                    if attempt < max_retries:
                        time.sleep(retry_delay)
                        continue
                    return []

                total_records = response.get('totalRecords', 0)

                if total_records == 0:
                    self.logger.info(f"No records found for {endpoint}")
                    return []

                # Step 2: Calculate total pages
                total_pages = (total_records + page_size - 1) // page_size
                self.logger.info(f"Found {total_records} total records across {total_pages} pages")

                if total_pages == 0:
                    return []

                # Step 3: Select a random page
                random_page = random.randint(1, total_pages)
                self.logger.info(f"Selected random page {random_page} of {total_pages}")

                # Step 4: Fetch the random page
                page_params = {
                    'page': random_page,
                    'pageSize': page_size,
                    'monitored': monitored_only
                }

                if include_series:
                    page_params['includeSeries'] = 'true'
                if include_artist:
                    page_params['includeArtist'] = 'true'
                if include_author:
                    page_params['includeAuthor'] = 'true'

                if additional_params:
                    page_params.update(additional_params)

                response = self.api_client.request(
                    api_url, api_key, api_timeout,
                    endpoint,
                    params=page_params,
                    count_api=False
                )

                if not response or not isinstance(response, dict):
                    self.logger.warning(f"Invalid response when getting page {random_page}")
                    return []

                records = response.get('records', [])
                self.logger.info(f"Retrieved {len(records)} records from page {random_page}")

                # Step 5: Apply custom filter if provided
                if filter_func:
                    original_count = len(records)
                    records = [r for r in records if filter_func(r)]
                    self.logger.debug(f"Filtered to {len(records)} records (from {original_count})")

                # Step 6: Return random sample
                if len(records) > count:
                    selected = random.sample(records, count)
                    self.logger.debug(f"Randomly selected {len(selected)} records")
                    return selected
                else:
                    self.logger.debug(f"Returning all {len(records)} records (fewer than requested {count})")
                    return records

            except json.JSONDecodeError as e:
                self.logger.error(f"JSON decode error (attempt {attempt+1}): {e}")
                if attempt < max_retries:
                    time.sleep(retry_delay)
                    continue
                return []

            except Exception as e:
                self.logger.error(f"Error getting random page (attempt {attempt+1}): {e}")
                if attempt < max_retries:
                    time.sleep(retry_delay)
                    continue
                return []

        self.logger.error("All attempts to get random page failed")
        return []

    def get_all_pages(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        endpoint: str,
        monitored_only: bool = True,
        page_size: int = 1000,
        additional_params: dict | None = None,
        filter_func: Callable[[dict], bool] | None = None,
        max_retries: int = 2,
        retry_delay: int = 3,
        include_series: bool = False,
        include_artist: bool = False,
        include_author: bool = False,
        max_pages: int = 1000
    ) -> list[dict]:
        """
        Fetch all records across all pages.

        Use this when you need all records (e.g., for counting totals).
        For most operations, prefer get_random_page() for efficiency.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request
            endpoint: The API endpoint
            monitored_only: Whether to filter for monitored items only
            page_size: Number of records per page
            additional_params: Additional query parameters
            filter_func: Optional filter function
            max_retries: Number of retry attempts per page
            retry_delay: Seconds between retries
            include_series: Include series data (Sonarr)
            include_artist: Include artist data (Lidarr)
            include_author: Include author data (Readarr)
            max_pages: Safety limit to prevent infinite loops

        Returns:
            List of all records, or partial results on error
        """
        all_records = []
        page = 1

        while page <= max_pages:
            retry_count = 0
            success = False
            records = []

            while retry_count <= max_retries and not success:
                params = {
                    'page': page,
                    'pageSize': page_size,
                    'monitored': monitored_only
                }

                if include_series:
                    params['includeSeries'] = 'true'
                if include_artist:
                    params['includeArtist'] = 'true'
                if include_author:
                    params['includeAuthor'] = 'true'

                if additional_params:
                    params.update(additional_params)

                self.logger.debug(f"Fetching page {page} (attempt {retry_count+1}/{max_retries+1})")

                try:
                    response = self.api_client.request(
                        api_url, api_key, api_timeout,
                        endpoint,
                        params=params,
                        count_api=False
                    )

                    if not response or not isinstance(response, dict):
                        self.logger.warning(f"Invalid response for page {page} (attempt {retry_count+1})")
                        if retry_count < max_retries:
                            retry_count += 1
                            time.sleep(retry_delay)
                            continue
                        break

                    records = response.get('records', [])
                    total_records = response.get('totalRecords', 0)

                    if page == 1:
                        self.logger.info(f"Total records reported: {total_records}")

                    if not records:
                        self.logger.debug(f"No more records on page {page}")
                        success = True
                        break

                    all_records.extend(records)
                    self.logger.debug(f"Retrieved {len(records)} records from page {page} (total: {len(all_records)})")

                    # Check if this was the last page
                    if len(records) < page_size:
                        success = True
                        break

                    success = True

                except Exception as e:
                    self.logger.error(f"Error fetching page {page} (attempt {retry_count+1}): {e}")
                    if retry_count < max_retries:
                        retry_count += 1
                        time.sleep(retry_delay)
                        continue
                    break

            if not success or not records:
                break

            page += 1

        self.logger.info(f"Total records fetched across all pages: {len(all_records)}")

        # Apply filter if provided
        if filter_func and all_records:
            original_count = len(all_records)
            all_records = [r for r in all_records if filter_func(r)]
            self.logger.debug(f"Filtered to {len(all_records)} records (from {original_count})")

        return all_records


def create_pagination_helper(api_client: ArrAPIClient) -> PaginationHelper:
    """
    Factory function to create a PaginationHelper instance.

    Args:
        api_client: An ArrAPIClient instance

    Returns:
        Configured PaginationHelper instance
    """
    return PaginationHelper(api_client)


# Common filter functions for reuse across apps

def create_monitored_filter(series_key: str = 'series', item_key: str | None = None) -> Callable[[dict], bool]:
    """
    Create a filter function for monitored items.

    Args:
        series_key: Key for parent entity (series, artist, author)
        item_key: Key for item-level monitored check (optional)

    Returns:
        Filter function that returns True for monitored items
    """
    def filter_func(record: dict) -> bool:
        # Check parent entity is monitored
        parent = record.get(series_key, {})
        if not parent.get('monitored', False):
            return False
        # Check item is monitored if key provided
        if item_key:
            return record.get(item_key, record.get('monitored', False))
        return record.get('monitored', False)
    return filter_func


def sonarr_monitored_filter(record: dict) -> bool:
    """Filter for monitored Sonarr episodes (series and episode both monitored)."""
    return (record.get('series', {}).get('monitored', False) and
            record.get('monitored', False))


def radarr_monitored_filter(record: dict) -> bool:
    """Filter for monitored Radarr movies."""
    return record.get('monitored', False)


def lidarr_monitored_filter(record: dict) -> bool:
    """Filter for monitored Lidarr albums (artist and album both monitored)."""
    return (record.get('artist', {}).get('monitored', False) and
            record.get('monitored', False))


def readarr_monitored_filter(record: dict) -> bool:
    """Filter for monitored Readarr books (author and book both monitored)."""
    return (record.get('author', {}).get('monitored', False) and
            record.get('monitored', False))
