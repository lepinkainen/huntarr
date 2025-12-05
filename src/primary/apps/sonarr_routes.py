#!/usr/bin/env python3

from flask import Blueprint, request, jsonify, render_template
import datetime, os, requests

from src.primary.state import reset_state_file, check_state_reset
from src.primary.utils.logger import get_logger
from src.primary.apps.base.routes import test_connection_handler
import traceback
from src.primary.apps.sonarr import missing, upgrade
from src.primary.auth import get_app_url_and_key
from src.primary.utils.database import get_database
from src.primary import settings_manager
import logging

logger = logging.getLogger(__name__)

sonarr_bp = Blueprint('sonarr', __name__)
sonarr_logger = get_logger("sonarr")

# State management now handled directly through database calls

@sonarr_bp.route('/sonarr')
def sonarr_page():
    """Render the Sonarr page"""
    return render_template('sonarr.html')

@sonarr_bp.route('/missing', methods=['POST'])
def sonarr_missing():
    """Handle Sonarr missing episodes search"""
    try:
        # Check if state needs to be reset
        check_state_reset("sonarr")
        
        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("sonarr")
        if not app_url or not api_key:
            return jsonify({"error": "Sonarr not configured"}), 400
        
        # Get settings from database
        missing_search_enabled = settings_manager.get_app_setting("sonarr", "missing_search", True)
        if not missing_search_enabled:
            return jsonify({"message": "Missing search is disabled for Sonarr"}), 200
        
        # Run missing search
        result = missing.run_missing_search(app_url, api_key, "sonarr")
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in Sonarr missing search: {e}")
        return jsonify({"error": str(e)}), 500

@sonarr_bp.route('/upgrade', methods=['POST'])
def sonarr_upgrade():
    """Handle Sonarr upgrade search"""
    try:
        # Check if state needs to be reset
        check_state_reset("sonarr")
        
        # Get app configuration from database
        app_url, api_key = get_app_url_and_key("sonarr")
        if not app_url or not api_key:
            return jsonify({"error": "Sonarr not configured"}), 400
        
        # Get settings from database
        upgrade_search_enabled = settings_manager.get_app_setting("sonarr", "upgrade_search", True)
        if not upgrade_search_enabled:
            return jsonify({"message": "Upgrade search is disabled for Sonarr"}), 200
        
        # Run upgrade search
        result = upgrade.run_upgrade_search(app_url, api_key, "sonarr")
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in Sonarr upgrade search: {e}")
        return jsonify({"error": str(e)}), 500

@sonarr_bp.route('/reset', methods=['POST'])
def sonarr_reset():
    """Reset Sonarr state files"""
    try:
        data = request.get_json() or {}
        reset_type = data.get('type', 'all')
        
        success = True
        if reset_type == 'missing' or reset_type == 'all':
            success &= reset_state_file("sonarr", "processed_missing")
        if reset_type == 'upgrade' or reset_type == 'all':
            success &= reset_state_file("sonarr", "processed_upgrades")
        
        if success:
            return jsonify({"message": f"Sonarr {reset_type} state reset successfully"})
        else:
            return jsonify({"error": f"Failed to reset Sonarr {reset_type} state"}), 500
            
    except Exception as e:
        logger.error(f"Error resetting Sonarr state: {e}")
        return jsonify({"error": str(e)}), 500

@sonarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Sonarr API instance - delegates to shared handler"""
    return test_connection_handler("sonarr", "v3", sonarr_logger)


