#!/usr/bin/env python3

from flask import Blueprint, request, jsonify
import datetime, os, requests

from src.primary.state import reset_state_file
from src.primary.utils.logger import get_logger
from src.primary.apps.base.routes import test_connection_handler
import traceback

radarr_bp = Blueprint('radarr', __name__)
radarr_logger = get_logger("radarr")

# State management now handled directly through database calls

@radarr_bp.route('/test-connection', methods=['POST'])
def test_connection():
    """Test connection to a Radarr API instance - delegates to shared handler"""
    return test_connection_handler("radarr", "v3", radarr_logger)


