/*
 * The "kaltura player" embedPlayer interface for fallback h.264 and flv video format support
 */
( function( mw, $ ) { "use strict";

	mw.EmbedPlayerSilverlight = {
		// Instance name:
		instanceOf : 'Silverlight',
		bindPostfix: '.sPlayer',
		//default playback start time to wait before falling back to unicast in millisecods
		defaultMulticastStartTimeout: 10000,
		containerId: null,
		// List of supported features:
		supports : {
			'playHead' : true,
			'pause' : true,
			'stop' : true,
			'sourceSwitch': true,
			'timeDisplay' : true,
			'volumeControl' : true,
			'overlays' : true,
			'fullscreen' : true
		},
		requestedSrcIndex: null,
		durationReceived: false,
		readyCallbackFunc: undefined,
		isMulticast: false,
		isError: false,
		// Create our player element
		setup: function( readyCallback ) {
			mw.log('EmbedPlayerSilverlight:: Setup');

			// Check if we created the sPlayer container
			var $container = this.getPlayerContainer();
			// If container exists, show the player and exit
			if( $container.length ){
				this.enablePlayerObject( true );
				$container.css('visibility', 'visible');
				readyCallback();
				return;
			}

			// Create the container
			this.getVideoDisplay().prepend(
				$('<div />')
					.attr('id', this.containerId)
					.addClass('maximize')
			);

			this.loadMedia( readyCallback );
		},

		loadMedia: function( readyCallback ) {

			var _this = this;
			var srcToPlay = _this.getSrc();

			//in multicast we must first check if payer is live
			var getMulticastStreamAddress = function() {
				$( _this ).trigger( 'checkIsLive', [ function( onAirStatus ) {
					 if ( onAirStatus ) {
						 getStreamAddress().then( doEmbedFunc );
					 }  else {
					 //stream is offline, stream address can be retrieved when online
						 _this.bindHelper( "liveOnline" + _this.bindPostfix , function( ) {
							 _this.unbindHelper( "liveOnline" + _this.bindPostfix );
							 _this.addPlayerSpinner();
							 getStreamAddress().then( doEmbedFunc );
							 //no need to save readyCallback since it was already called
							 _this.readyCallbackFunc = undefined;

						 });
						 readyCallback();
					 }
				}]);
			}

			//parse url address from playmanifest
			var getStreamAddress = function() {
				var deferred = $.Deferred();
				$.ajax({
					url: _this.getSrc() + "&responseFormat=jsonp",
					dataType: 'jsonp',
					success: function( playmanifest ){
						var flavors = playmanifest.flavors;
						if ( flavors && flavors.length > 0 ) {
							srcToPlay = flavors[0].url;
							deferred.resolve();
						} else {
							deferred.reject();
						}
					},
					error: function() {
						deferred.reject();
					}
				});
				return deferred.promise();
			}
			//if error occured- don't try to load playmanifest, return
			if ( !$.isEmptyObject( this.playerError )) {
				readyCallback();
				return;
			}

			var isMimeType = function( mimeType ) {
				if ( _this.mediaElement.selectedSource && _this.mediaElement.selectedSource.mimeType == mimeType ) {
					return true;
				}
				return false;
			}

			var doEmbedFunc = function() {
				var flashvars = {
					startvolume:	_this.volume
				}
				if ( isMimeType( "video/playreadySmooth" )
					|| isMimeType( "video/ism" ) ) {
					_this.isMulticast = false;

					flashvars.smoothStreamPlayer = true;
					flashvars.preload = "auto";
					flashvars.entryURL = srcToPlay;
					//flashvars.debug = true;

					if ( isMimeType( "video/playreadySmooth" ) )
					{
						var licenseUrl = _this.getKalturaConfig( null, 'playreadyLicenseUrl' ) || mw.getConfig( 'Kaltura.LicenseServerURL' );
						if ( !licenseUrl ) {
							mw.log('EmbedPlayerSPlayer::Error:: failed to retrieve playready license URL ' );
						}  else {
							flashvars.licenseURL = licenseUrl;
						}

						var customData = {
							partnerId: _this.kpartnerid,
							ks: _this.getFlashvars( 'ks' ),
							entryId: _this.kentryid
						}
						if ( _this.b64Referrer ) {
							flashvars.referrer = _this.b64Referrer;
						}
						var customDataString = "";
						for(var propt in customData){
							customDataString += propt + "=" + customData[propt] + "&";
						}
						flashvars.challengeCustomData = customDataString;
					}
				} else if ( isMimeType( "video/multicast" ) ) {
					_this.isMulticast = true;
					_this.bindHelper( "liveOffline", function( ) {
						//if stream became offline
						 if (  _this.playerObject ) {
							 _this.playerObject.stop();
						 }
					});

					flashvars.multicastPlayer = true;
					flashvars.streamAddress = srcToPlay;
					//flashvars.debug = true;

					//check if multicast not available
					var timeout = _this.getKalturaConfig( null, 'multicastStartTimeout' ) || _this.defaultMulticastStartTimeout;
					_this.isError = false;
					setTimeout( function() {
						if ( !_this.durationReceived ) {
							_this.isError = true
							if ( _this.getKalturaConfig( null, 'enableMulticastFallback' ) == true ) {
								//remove current source to fallback to unicast if multicast failed
								for ( var i=0; i< _this.mediaElement.sources.length; i++ ) {
									if ( _this.mediaElement.sources[i] == _this.mediaElement.selectedSource ) {
										if ( _this.playerObject ) {
											_this.playerObject.stop();
										}
										_this.mediaElement.sources.splice(i, 1);

										_this.setupSourcePlayer();
										return;
									}
								}
							} else {
								var errorObj = { message: gM( 'ks-LIVE-STREAM-NOT-AVAILABLE' ), title: gM( 'ks-ERROR' ) };
								_this.showErrorMsg( errorObj );
							}

							_this.readyCallbackFunc = undefined;
						}
					}, timeout );
				}

				flashvars.autoplay = _this.autoplay;
				_this.durationReceived = false;
				_this.readyCallbackFunc = readyCallback;
				var playerElement = new mw.PlayerElementSilverlight( _this.containerId, 'splayer_' + _this.pid, flashvars, _this, function() {
					var bindEventMap = {
						'playerPaused' : 'onPause',
						'playerPlayed' : 'onPlay',
						'durationChange' : 'onDurationChange',
						'playerPlayEnd' : 'onClipDone',
						'playerUpdatePlayhead' : 'onUpdatePlayhead',
						'bytesTotalChange' : 'onBytesTotalChange',
						'bytesDownloadedChange' : 'onBytesDownloadedChange',
						'playerSeekEnd': 'onPlayerSeekEnd',
						'alert': 'onAlert',
						'switchingChangeStarted': 'onSwitchingChangeStarted',
						'switchingChangeComplete' : 'onSwitchingChangeComplete',
						'flavorsListChanged' : 'onFlavorsListChanged',
						'enableGui' : 'onEnableGui'
					};

					_this.playerObject = playerElement;
					$.each( bindEventMap, function( bindName, localMethod ) {
						_this.playerObject.addJsListener(  bindName, localMethod );
					});

					if (  _this.getFlashvars( 'stretchVideo' ) ) {
						playerElement.stretchFill();
					}
					//readyCallback();
				});
			}

			if ( _this.isLive() ) {
				getMulticastStreamAddress();
			} else {
				getStreamAddress().then( doEmbedFunc );
			}
		},

		setCurrentTime: function( time ){
			this.slCurrentTime = time;
		},

		/**
		 * enable / disable player object from listening and reacting to events
		 * @param enabled true will enable, false will disable
		 */
		enablePlayerObject: function( enabled ){
			if ( this.playerObject ) {
				this.playerObject.disabled = enabled;
			}
		},

		/**
		 * Hide the player from the screen and disable events listeners
		 **/
		disablePlayer: function(){
			this.getPlayerContainer().css('visibility', 'hidden');
			this.enablePlayerObject( false );
		},


		changeMediaCallback: function( callback ){
			this.slCurrentTime = 0;
			// Check if we have source
			if( this.getSrc() ) {
				this.loadMedia( callback );
			} else {
				callback();
			}

		},

		/*
		 * Write the Embed html to the target
		 */
		embedPlayerHTML: function() {},

		updatePlayhead: function () {
			if ( this.seeking ) {
				this.seeking = false;
				this.slCurrentTime = this.playerObject.currentTime;
			}
		},

		/**
		 * on Pause callback from the kaltura flash player calls parent_pause to
		 * update the interface
		 */
		onPause: function() {
			this.updatePlayhead();
			$( this ).trigger( "onpause" );
		},

		/**
		 * onPlay function callback from the kaltura flash player directly call the
		 * parent_play
		 */
		onPlay: function() {
			//workaround to avoid two playing events with autoPlay.
			if ( !this.durationReceived ) {
				return;
			}

			this.updatePlayhead();
			$( this ).trigger( "playing" );
			this.hideSpinner();
			if ( this.seeking == true ) {
				this.onPlayerSeekEnd();
			}
			this.stopped = this.paused = false;
		},

		callReadyFunc: function() {
			if ( this.readyCallbackFunc ) {
				this.readyCallbackFunc();
				this.readyCallbackFunc = undefined;
			}
		},

		onDurationChange: function( data, id ) {
			//first durationChange indicate player is ready
			if ( !this.durationReceived ) {
				this.durationReceived = true;
				if ( !this.isError ) {
					this.callReadyFunc();
					if ( !this.isAudioPlayer ) {
						this.removePoster();
					}
					//in silverlight we have unusual situation where "Start" is sent after "playing", this workaround fixes the controls state
					if ( this.autoplay ) {
						$( this ).trigger( "playing" );
						this.monitor();
					}
				} else if ( this.autoplay ) {
					this.playerObject.pause();
				}
			}

			// Update the duration ( only if not in url time encoding mode:
			if( !this.supportsURLTimeEncoding() ){
				this.setDuration( data );
				this.playerObject.duration = data;
			}
		},

		onClipDone: function() {
			$( this ).trigger( "onpause" );
			this.playerObject.pause();
			this.parent_onClipDone();
			this.currentTime = this.slCurrentTime = 0;
			this.preSequenceFlag = false;
		},

		onAlert: function ( data, id ) {
			mw.log('EmbedPlayerSPlayer::onAlert ' + data );
			var messageText = data;
			var dataParams = data.split(" ");
			if ( dataParams.length ) {
				var errorCode = dataParams[0];
				//DRM license related error has 6XXX error code
				if ( errorCode.length == 4 && errorCode.indexOf("6")==0 )  {
					messageText = gM( 'ks-NO-DRM-LICENSE' );
				}
			}

			var errorObj =  { message: messageText, title: gM( 'ks-ERROR' ) };
			if ( this.readyCallbackFunc ) {
				this.setError( errorObj );
				this.callReadyFunc();
			} else {
				this.layoutBuilder.displayAlert( errorObj );
			}



		},

		/**
		 * play method calls parent_play to update the interface
		 */
		play: function() {
			mw.log('EmbedPlayerSPlayer::play');
			var _this = this;
			if ( this.durationReceived && this.parent_play() ) {
				if ( this.isMulticast  ) {
					this.bindHelper( "durationChange" , function() {
						_this.playerObject.play();
					});
					this.playerObject.reloadMedia();
				} else {
					this.playerObject.play();
				}
				this.monitor();
			} else {
				mw.log( "EmbedPlayerSPlayer:: parent play returned false, don't issue play on splayer element");
			}
		},

		/**
		 * pause method calls parent_pause to update the interface
		 */
		pause: function() {
			try {
				//after first play we don't want to pause in multicast, only stop
				if ( this.isMulticast && !this.firstPlay ) {
					this.playerObject.stop();
				} else {
					this.playerObject.pause();
				}
			} catch(e) {
				mw.log( "EmbedPlayerSPlayer:: doPause failed" );
			}
			this.parent_pause();
		},
		/**
		 * playerSwitchSource switches the player source working around a few bugs in browsers
		 *
		 * @param {object}
		 *			source Video Source object to switch to.
		 * @param {function}
		 *			switchCallback Function to call once the source has been switched
		 * @param {function}
		 *			doneCallback Function to call once the clip has completed playback
		 */
		playerSwitchSource: function( source, switchCallback, doneCallback ){
			//we are not supposed to switch source. Ads can be played as siblings. Change media doesn't use this method.
			if( switchCallback ){
				switchCallback( this.playerObject );
			}
			setTimeout(function(){
				if( doneCallback )
					doneCallback();
			}, 100);
		},

		/**
		 * Issues a seek to the playerElement
		 *
		 * @param {Float}
		 *			percentage Percentage of total stream length to seek to
		 */
		seek: function(percentage) {
			var _this = this;
			var seekTime = percentage * this.getDuration();
			mw.log( 'EmbedPlayerKalturaSplayer:: seek: ' + percentage + ' time:' + seekTime );
			if (this.supportsURLTimeEncoding()) {

				// Make sure we could not do a local seek instead:
				if (!(percentage < this.bufferedPercent
					&& this.playerObject.duration && !this.didSeekJump)) {
					// We support URLTimeEncoding call parent seek:
					this.parent_seek( percentage );
					return;
				}
			}
			if ( this.playerObject.duration ) //we already loaded the movie
			{
				this.seeking = true;
				// trigger the html5 event:
				$( this ).trigger( 'seeking' );

				// Issue the seek to the flash player:
				this.playerObject.seek( seekTime );

				// Include a fallback seek timer: in case the kdp does not fire 'playerSeekEnd'
				var orgTime = this.slCurrentTime;
				this.seekInterval = setInterval( function(){
					if( _this.slCurrentTime != orgTime ){
						_this.seeking = false;
						clearInterval( _this.seekInterval );
						$( _this ).trigger( 'seeked' );
					}
				}, mw.getConfig( 'EmbedPlayer.MonitorRate' ) );
			} else if ( percentage != 0 ) {
				this.playerObject.play();
			}

			// Run the onSeeking interface update
			this.layoutBuilder.onSeek();
		},

		/**
		 * Issues a volume update to the playerElement
		 *
		 * @param {Float}
		 *			percentage Percentage to update volume to
		 */
		setPlayerElementVolume: function(percentage) {
			this.playerObject.changeVolume(  percentage );
		},

		/**
		 * function called by flash at set interval to update the playhead.
		 */
		onUpdatePlayhead: function( playheadValue ) {
			if ( this.seeking ) {
				this.seeking = false;
			}
			this.slCurrentTime = playheadValue;
			$( this ).trigger( 'timeupdate' );
		},

		/**
		 * function called by flash when the total media size changes
		 */
		onBytesTotalChange: function( data, id ) {
			this.bytesTotal = data.newValue;
		},

		/**
		 * function called by flash applet when download bytes changes
		 */
		onBytesDownloadedChange: function( data, id ) {
			this.bytesLoaded = data.newValue;
			this.bufferedPercent = this.bytesLoaded / this.bytesTotal;
			// Fire the parent html5 action
			$( this ).trigger( 'updateBufferPercent', this.bufferedPercent );
		},

		onPlayerSeekEnd: function () {
			$( this ).trigger( 'seeked' );
			this.updatePlayhead();
			if( this.seekInterval  ) {
				clearInterval( this.seekInterval );
			}
		},

		onSwitchingChangeStarted: function ( data, id ) {
			$( this ).trigger( 'sourceSwitchingStarted' );
		},

		onSwitchingChangeComplete: function ( data, id ) {
			var value = JSON.parse( data );
			//fix a bug that old switching process finished before the user switching request and the UI was misleading
			if ( this.requestedSrcIndex!== null && value.newIndex !== this.requestedSrcIndex ) {
				return;
			}
			mw.log( 'EmbedPlayerKalturaSplayer: switchingChangeComplete: new index: ' +  value.newIndex);
			this.mediaElement.setSourceByIndex ( value.newIndex );
		},

		onFlavorsListChanged: function ( data, id ) {
			var values = JSON.parse( data );
			this.replaceSources( values.flavors );
		},

		onEnableGui: function ( data, id ) {
			if ( data.guiEnabled === false ) {
				this.disablePlayControls();
			} else {
				this.enablePlayControls();
			}
		},

		/**
		 * Get the embed player time
		 */
		getPlayerElementTime: function() {
			// update currentTime
			return this.slCurrentTime;
		},

		/**
		 * Get the embed flash object player Element
		 */
		getPlayerElement: function(){
			return this.playerObject;
		},

		getPlayerContainer: function(){
			if( !this.containerId ){
				this.containerId = 'splayer_' + this.id;
			}
			return $( '#' +  this.containerId );
		},

		/*
		 * get the source index for a given source
		 */
		getSourceIndex: function( source ){
			var sourceIndex = null;
			$.each( this.mediaElement.getPlayableSources(), function( currentIndex, currentSource ) {
				if( source.getBitrate() == currentSource.getBitrate() ){
					sourceIndex = currentIndex;
					return false;
				}
			});
			if( sourceIndex == null ){
				mw.log( "EmbedPlayerSPlayer:: Error could not find source: " + source.getSrc() );
			}
			return sourceIndex;
		},
		switchSrc: function ( source ) {
			if ( this.playerObject && this.mediaElement.getPlayableSources().length > 1 ) {
				var trackIndex = this.getSourceIndex( source );
				mw.log( "EmbedPlayerSPlayer:: switch to track index: " + trackIndex);
				$( this ).trigger( 'sourceSwitchingStarted' );
				this.requestedSrcIndex = trackIndex;
				this.playerObject.selectTrack( trackIndex );
			}
		},
		canAutoPlay: function() {
			return true;
		},

		clean:function(){
			$(this.getPlayerContainer()).remove();
		}

	}
} )( mediaWiki, jQuery );
