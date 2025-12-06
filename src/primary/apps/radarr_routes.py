#!/usr/bin/env python3

import logging

from flask import Blueprint, jsonify, request

from src.primary import settings_manager
from src.primary.apps.base.routes import test_connection_handler
from src.primary.apps.radarr import missing, upgrade
from src.primary.auth import get_app_url_and_key
from src.primary.state import check_state_reset, reset_state_file
from src.primary.utils.logger import get_logger

logger = logging.getLogger(__name__)

radarr_bp = Blueprint('radarr', __name__)
radarr_logger = get_logger("radarr")

# State management now handled directly through database calls

@radarr_bp.route('/missing', methods=['POST'])
def radarr_missing():
    """Handle Radarr missing movies search"""
    try:
        # Check if state needs to be reset
        check_state_reset("radarr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("radarr")
        if not app_url or not api_key:
            return jsonify({"error": "Radarr not configured"}), 400

        # Get settings from database
        missing_search_enabled = settings_manager.get_app_setting("radarr", "missing_search", True)
        if not missing_search_enabled:
            return jsonify({"message": "Missing search is disabled for Radarr"}), 200

        # Run missing search
        result = missing.run_missing_search(app_url, api_key, "radarr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Radarr missing search: {e}")
        return jsonify({"error": str(e)}), 500

@radarr_bp.route('/upgrade', methods=['POST'])
def radarr_upgrade():
    """Handle Radarr upgrade search"""
    try:
        # Check if state needs to be reset
        check_state_reset("radarr")

        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("radarr")
        if not app_url or not api_key:
            return jsonify({"error": "Radarr not configured"}), 400

        # Get settings from database
        upgrade_search_enabled = settings_manager.get_app_setting("radarr", "upgrade_search", True)
        if not upgrade_search_enabled:
            return jsonify({"message": "Upgrade search is disabled for Radarr"}), 200

        # Run upgrade search
        result = upgrade.run_upgrade_search(app_url, api_key, "radarr")
        return jsonify(result)

    except Exception as e:
        logger.error(f"Error in Radarr upgrade search: {e}")
        return jsonify({"error": str(e)}), 500

@radarr_bp.route('/reset', methods=['POST'])
def radarr_reset():
    """Reset Radarr state files"""
    try:
        data = request.get_json() or {}
        reset_type = data.get('type', 'all')

        success = True
        if reset_type == 'missing' or reset_type == 'all':
            success &= reset_state_file("radarr", "processed_missing")
        if reset_type == 'upgrade' or reset_type == 'all':
            success &= reset_state_file("radarr", "processed_upgrades")

        if success:
            return jsonify({"message": f"Radarr {reset_type} state reset successfully"})
        else:
            return jsonify({"error": f"Failed to reset Radarr {reset_type} state"}), 500

    except Exception as e:
        logger.error(f"Error resetting Radarr state: {e}")
        return jsonify({"error": str(e)}), 500

@radarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Radarr API instance - delegates to shared handler"""
    return test_connection_handler("radarr", "v3", radarr_logger)


