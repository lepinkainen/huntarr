#!/usr/bin/env python3

from flask import Blueprint, request, jsonify
import datetime, os, requests

from src.primary.state import reset_state_file, check_state_reset
from src.primary.utils.logger import get_logger, APP_LOG_FILES
from src.primary.settings_manager import load_settings, get_ssl_verify_setting
from src.primary.apps.base.routes import eros_test_connection_handler
import traceback
import socket
from urllib.parse import urlparse
from src.primary.apps.eros import api as eros_api
from src.primary.apps.eros import get_configured_instances
from src.primary.apps.eros import missing, upgrade
from src.primary.auth import get_app_url_and_key
from src.primary import settings_manager
import logging
# Import centralized path configuration
from src.primary.utils.config_paths import CONFIG_PATH

logger = logging.getLogger(__name__)

eros_bp = Blueprint('eros', __name__)
eros_logger = get_logger("eros")

# State management now handled directly through database calls

@eros_bp.route('/missing', methods=['POST'])
def eros_missing():
    """Handle Eros missing items search"""
    try:
        # Check if state needs to be reset
        check_state_reset("eros")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("eros")
        if not app_url or not api_key:
            return jsonify({"error": "Eros not configured"}), 400

        # Get settings from database
        missing_search_enabled = settings_manager.get_app_setting("eros", "missing_search", True)
        if not missing_search_enabled:
            return jsonify({"message": "Missing search is disabled for Eros"}), 200

        # Run missing search
        result = missing.run_missing_search(app_url, api_key, "eros")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Eros missing search: {e}")
        return jsonify({"error": str(e)}), 500

@eros_bp.route('/upgrade', methods=['POST'])
def eros_upgrade():
    """Handle Eros upgrade search"""
    try:
        # Check if state needs to be reset
        check_state_reset("eros")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("eros")
        if not app_url or not api_key:
            return jsonify({"error": "Eros not configured"}), 400

        # Get settings from database
        upgrade_search_enabled = settings_manager.get_app_setting("eros", "upgrade_search", True)
        if not upgrade_search_enabled:
            return jsonify({"message": "Upgrade search is disabled for Eros"}), 200

        # Run upgrade search
        result = upgrade.run_upgrade_search(app_url, api_key, "eros")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Eros upgrade search: {e}")
        return jsonify({"error": str(e)}), 500

@eros_bp.route('/reset', methods=['POST'])
def eros_reset():
    """Reset Eros state files"""
    try:
        data = request.get_json() or {}
        reset_type = data.get('type', 'all')

        success = True
        if reset_type == 'missing' or reset_type == 'all':
            success &= reset_state_file("eros", "processed_missing")
        if reset_type == 'upgrade' or reset_type == 'all':
            success &= reset_state_file("eros", "processed_upgrades")

        if success:
            return jsonify({"message": f"Eros {reset_type} state reset successfully"})
        else:
            return jsonify({"error": f"Failed to reset Eros {reset_type} state"}), 500

    except Exception as e:
        logger.error(f"Error resetting Eros state: {e}")
        return jsonify({"error": str(e)}), 500

def test_connection_internal(url, api_key):
    """Internal helper for status checks - returns dict instead of Flask response"""
    # Validate URL format
    if not (url.startswith('http://') or url.startswith('https://')):
        eros_logger.warning(f"API URL missing http(s) scheme: {url}")
        url = f"http://{url}"
        eros_logger.debug(f"Auto-correcting URL to: {url}")

    # Try to establish a socket connection first to check basic connectivity
    parsed_url = urlparse(url)
    hostname = parsed_url.hostname
    port = parsed_url.port or (443 if parsed_url.scheme == 'https' else 80)

    try:
        # Try socket connection for quick feedback on connectivity issues
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)  # Short timeout for quick feedback
        result = sock.connect_ex((hostname, port))
        sock.close()

        if result != 0:
            error_msg = f"Connection refused - Unable to connect to {hostname}:{port}."
            eros_logger.error(error_msg)
            return {"success": False, "message": error_msg}
    except socket.gaierror:
        error_msg = f"DNS resolution failed - Cannot resolve hostname: {hostname}."
        eros_logger.error(error_msg)
        return {"success": False, "message": error_msg}
    except Exception as e:
        eros_logger.debug(f"Socket test error, continuing with full request: {str(e)}")

    # For Eros, we only use v3 API path
    api_url = f"{url.rstrip('/')}/api/v3/system/status"
    headers = {'X-Api-Key': api_key}
    verify_ssl = get_ssl_verify_setting()

    try:
        response = requests.get(api_url, headers=headers, timeout=(5, 30), verify=verify_ssl)
        response.raise_for_status()
        response_data = response.json()
        version = response_data.get('version')

        if version and version.startswith('3'):
            return {"success": True, "message": "Successfully connected to Eros API", "version": version, "api_version": "v3"}
        elif version and version.startswith('2'):
            return {"success": False, "message": f"Detected Whisparr V2 (version {version}). Eros requires V3 API."}
        else:
            return {"success": False, "message": f"Unexpected version {version} detected. Eros requires V3 API."}

    except requests.exceptions.HTTPError:
        if response.status_code == 401:
            return {"success": False, "message": "Invalid API key - Authentication failed"}
        elif response.status_code == 404:
            return {"success": False, "message": "API endpoint not found: Not a valid Eros server."}
        else:
            return {"success": False, "message": f"Eros server error (HTTP {response.status_code})"}
    except requests.exceptions.ConnectionError as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}
    except requests.exceptions.Timeout:
        return {"success": False, "message": "Connection timed out"}
    except Exception as e:
        return {"success": False, "message": f"Unexpected error: {str(e)}"}

@eros_bp.route('/status', methods=['GET'])
def get_status():
    """Get the status of all configured Eros instances"""
    try:
        instances = get_configured_instances()
        eros_logger.debug(f"Eros configured instances: {instances}")
        if instances:
            connected_count = 0
            for instance in instances:
                if test_connection_internal(instance['url'], instance['api_key'])['success']:
                    connected_count += 1
            return jsonify({
                "configured": True,
                "connected": connected_count > 0,
                "connected_count": connected_count,
                "total_configured": len(instances)
            })
        else:
            eros_logger.debug("No Eros instances configured")
            return jsonify({"configured": False, "connected": False})
    except Exception as e:
        eros_logger.error(f"Error getting Eros status: {str(e)}")
        return jsonify({"configured": False, "connected": False, "error": str(e)})

@eros_bp.route('/test-connection', methods=['POST'])
def test_connection_endpoint():
    """Test connection to an Eros API instance - delegates to shared handler"""
    return eros_test_connection_handler(eros_logger)

@eros_bp.route('/test-settings', methods=['GET'])
def test_eros_settings():
    """Debug endpoint to test Eros settings loading from database"""
    try:
        results = {}
        
        # Load settings from database via settings_manager
        try:
            from src.primary.settings_manager import load_settings
            settings = load_settings("eros")
            results["database_settings"] = settings
            results["configured"] = bool(settings.get("url") and settings.get("api_key"))
        except Exception as e:
            results["database_error"] = str(e)
            
        results["note"] = "Settings are now stored in database. Legacy JSON files are no longer used."
            
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)})

@eros_bp.route('/reset-processed', methods=['POST'])
def reset_processed_state():
    """Reset the processed state files for Eros"""
    try:
        # Reset the state files for missing and upgrades
        reset_state_file("eros", "processed_missing")
        reset_state_file("eros", "processed_upgrades")
        
        eros_logger.info("Successfully reset Eros processed state files")
        return jsonify({"success": True, "message": "Successfully reset processed state"})
    except Exception as e:
        error_msg = f"Error resetting Eros state: {str(e)}"
        eros_logger.error(error_msg)
        return jsonify({"success": False, "message": error_msg}), 500


