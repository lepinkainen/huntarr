#!/usr/bin/env python3
"""
Tag management for *arr applications.

This module provides unified tag operations that are used identically across
all *arr applications. Previously, these functions were duplicated 6 times
(~720 lines total) with only entity type names differing.

Supported entity types:
- series (Sonarr, Whisparr)
- movie (Radarr, Eros)
- artist (Lidarr)
- author (Readarr)
"""


from src.primary.apps.base.api_client import ArrAPIClient


class TagManager:
    """
    Universal tag manager for *arr applications.

    This class consolidates the tag management functions that were duplicated
    across 6 app modules:
    - get_or_create_tag() - ~37 lines x 6 apps = 222 lines
    - add_tag_to_*() - ~42 lines x 6 apps = 252 lines
    - tag_processed_*() - ~32 lines x 6 apps = 192 lines

    Total duplication eliminated: ~666 lines

    Attributes:
        api_client: The ArrAPIClient instance for making API requests
        entity_type: The type of entity to tag (series, movie, artist, author)
        entity_endpoint: The API endpoint for the entity type
        logger: Logger instance inherited from api_client

    Example:
        >>> client = ArrAPIClient("sonarr", api_version="v3")
        >>> tag_mgr = TagManager(client, entity_type="series")
        >>> tag_id = tag_mgr.get_or_create_tag(api_url, api_key, 30, "huntarr-missing")
        >>> tag_mgr.add_tag_to_entity(api_url, api_key, 30, series_id=123, tag_id=tag_id)
    """

    # Mapping of entity types to their API endpoints
    ENTITY_ENDPOINTS = {
        'series': 'series',
        'movie': 'movie',
        'artist': 'artist',
        'author': 'author',
        'album': 'album',  # For Lidarr album-level operations
        'book': 'book',    # For Readarr book-level operations
    }

    def __init__(self, api_client: ArrAPIClient, entity_type: str):
        """
        Initialize the tag manager.

        Args:
            api_client: An ArrAPIClient instance for making requests
            entity_type: The type of entity (series, movie, artist, author)

        Raises:
            ValueError: If entity_type is not recognized
        """
        if entity_type not in self.ENTITY_ENDPOINTS:
            raise ValueError(f"Unknown entity type: {entity_type}. "
                           f"Supported types: {list(self.ENTITY_ENDPOINTS.keys())}")

        self.api_client = api_client
        self.entity_type = entity_type
        self.entity_endpoint = self.ENTITY_ENDPOINTS[entity_type]
        self.logger = api_client.logger

    def get_or_create_tag(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        tag_label: str
    ) -> int | None:
        """
        Get existing tag ID or create a new tag.

        This method checks if a tag with the given label exists in the *arr
        application. If it exists, returns its ID. If not, creates a new tag
        and returns the new ID.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request
            tag_label: The label/name of the tag (e.g., "huntarr-missing")

        Returns:
            The tag ID if successful, None otherwise
        """
        try:
            # First, check if the tag already exists
            response = self.api_client.request(
                api_url, api_key, api_timeout,
                "tag",
                count_api=False
            )

            if response:
                for tag in response:
                    if tag.get('label') == tag_label:
                        tag_id = tag.get('id')
                        self.logger.debug(f"Found existing tag '{tag_label}' with ID: {tag_id}")
                        return tag_id

            # Tag doesn't exist, create it
            tag_data = {"label": tag_label}
            response = self.api_client.request(
                api_url, api_key, api_timeout,
                "tag",
                method="POST",
                data=tag_data,
                count_api=False
            )

            if response and 'id' in response:
                tag_id = response['id']
                self.logger.info(f"Created new tag '{tag_label}' with ID: {tag_id}")
                return tag_id
            else:
                self.logger.error(f"Failed to create tag '{tag_label}'. Response: {response}")
                return None

        except Exception as e:
            self.logger.error(f"Error managing tag '{tag_label}': {e}")
            return None

    def add_tag_to_entity(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        entity_id: int,
        tag_id: int
    ) -> bool:
        """
        Add a tag to an entity (series, movie, artist, or author).

        This method fetches the current entity data, checks if the tag is
        already present, and if not, adds it and updates the entity.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request
            entity_id: The ID of the entity to tag
            tag_id: The ID of the tag to add

        Returns:
            True if successful (including if tag was already present), False otherwise
        """
        try:
            # First get the current entity data
            endpoint = f"{self.entity_endpoint}/{entity_id}"
            entity_data = self.api_client.request(
                api_url, api_key, api_timeout,
                endpoint,
                count_api=False
            )

            if not entity_data:
                self.logger.error(f"Failed to get {self.entity_type} data for ID: {entity_id}")
                return False

            # Check if the tag is already present
            current_tags = entity_data.get('tags', [])
            if tag_id in current_tags:
                self.logger.debug(f"Tag {tag_id} already exists on {self.entity_type} {entity_id}")
                return True

            # Add the new tag to the list
            current_tags.append(tag_id)
            entity_data['tags'] = current_tags

            # Update the entity with the new tags
            response = self.api_client.request(
                api_url, api_key, api_timeout,
                endpoint,
                method="PUT",
                data=entity_data,
                count_api=False
            )

            if response:
                self.logger.debug(f"Successfully added tag {tag_id} to {self.entity_type} {entity_id}")
                return True
            else:
                self.logger.error(f"Failed to update {self.entity_type} {entity_id} with tag {tag_id}")
                return False

        except Exception as e:
            self.logger.error(f"Error adding tag {tag_id} to {self.entity_type} {entity_id}: {e}")
            return False

    def tag_processed_entity(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        entity_id: int,
        tag_label: str = "huntarr-missing"
    ) -> bool:
        """
        Tag an entity with the specified tag label.

        This is a convenience method that combines get_or_create_tag() and
        add_tag_to_entity() into a single call. This is the most commonly
        used tagging operation in Huntarr.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request
            entity_id: The ID of the entity to tag
            tag_label: The tag to apply (e.g., "huntarr-missing", "huntarr-upgraded")

        Returns:
            True if the tagging was successful, False otherwise
        """
        try:
            # Get or create the tag
            tag_id = self.get_or_create_tag(api_url, api_key, api_timeout, tag_label)
            if tag_id is None:
                self.logger.error(
                    f"Failed to get or create tag '{tag_label}' in {self.api_client.app_name.title()}"
                )
                return False

            # Add the tag to the entity
            success = self.add_tag_to_entity(api_url, api_key, api_timeout, entity_id, tag_id)
            if success:
                self.logger.debug(
                    f"Successfully tagged {self.api_client.app_name.title()} "
                    f"{self.entity_type} {entity_id} with '{tag_label}'"
                )
                return True
            else:
                self.logger.error(
                    f"Failed to add tag '{tag_label}' to {self.api_client.app_name.title()} "
                    f"{self.entity_type} {entity_id}"
                )
                return False

        except Exception as e:
            self.logger.error(
                f"Error tagging {self.api_client.app_name.title()} "
                f"{self.entity_type} {entity_id} with '{tag_label}': {e}"
            )
            return False

    def remove_tag_from_entity(
        self,
        api_url: str,
        api_key: str,
        api_timeout: int,
        entity_id: int,
        tag_id: int
    ) -> bool:
        """
        Remove a tag from an entity.

        Args:
            api_url: The base URL of the API
            api_key: The API key for authentication
            api_timeout: Timeout for the request
            entity_id: The ID of the entity
            tag_id: The ID of the tag to remove

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get current entity data
            endpoint = f"{self.entity_endpoint}/{entity_id}"
            entity_data = self.api_client.request(
                api_url, api_key, api_timeout,
                endpoint,
                count_api=False
            )

            if not entity_data:
                self.logger.error(f"Failed to get {self.entity_type} data for ID: {entity_id}")
                return False

            # Check if the tag is present
            current_tags = entity_data.get('tags', [])
            if tag_id not in current_tags:
                self.logger.debug(f"Tag {tag_id} not present on {self.entity_type} {entity_id}")
                return True

            # Remove the tag
            current_tags.remove(tag_id)
            entity_data['tags'] = current_tags

            # Update the entity
            response = self.api_client.request(
                api_url, api_key, api_timeout,
                endpoint,
                method="PUT",
                data=entity_data,
                count_api=False
            )

            if response:
                self.logger.debug(f"Successfully removed tag {tag_id} from {self.entity_type} {entity_id}")
                return True
            else:
                self.logger.error(f"Failed to update {self.entity_type} {entity_id}")
                return False

        except Exception as e:
            self.logger.error(f"Error removing tag {tag_id} from {self.entity_type} {entity_id}: {e}")
            return False


def create_tag_manager(api_client: ArrAPIClient, entity_type: str) -> TagManager:
    """
    Factory function to create a TagManager instance.

    Args:
        api_client: An ArrAPIClient instance
        entity_type: The type of entity (series, movie, artist, author)

    Returns:
        Configured TagManager instance
    """
    return TagManager(api_client=api_client, entity_type=entity_type)
