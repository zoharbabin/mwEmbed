( function( mw, $ ) {"use strict";

mw.PluginManager.add( 'related', mw.KBaseComponent.extend({

	defaultConfig: {
		parent: "topBarContainer",
		order: 4,
		align: "right",
		//visible: false,
		itemsLimit: 12,
		displayOnPlaybackDone: true,
		autoContinueTime: null,
		templatePath: 'components/related/related.tmpl.html',
		playlistId: null,
	},
	$screen: null,
	setup: function(){
		var _this = this;

		this.bind('playerReady', function(){
			// Stop timer
			_this.stopTimer();

			// Reset our items data
			_this.templateData = null;

			// Load items data
			_this.getItemsData(function(){
				if( _this.$screen ){
					_this.$screen.remove();
					_this.$screen = null;
				}
			});
		});

		this.bind('onplay', function(){
			_this.hide();
		});

		if( this.getConfig('displayOnPlaybackDone') ){
			this.bind('onEndedDone', function(){
				_this.show();
				if( _this.getConfig('autoContinueTime') ){
					_this.startTimer();
				}
			});				
		}

		this.bind('replayEvent', function(){
			_this.stopTimer();
		});
	},
	startTimer: function(){
		var _this = this;
		var updateTimeRemaining = function(){
			var ct = _this.getConfig('timeRemaining');
			if( ct > 0 ){
				_this.setConfig('timeRemaining', --ct);
				_this.timeRemainingMonitor = setTimeout(updateTimeRemaining, 1000);
			} else {
				_this.stopTimer();
				_this.changeMedia( null, _this.templateData.nextItem.id );
			}
		};
		setTimeout(updateTimeRemaining, 1000);
	},
	stopTimer: function(){
		// Clear our interval
		clearTimeout(this.timeRemainingMonitor);
		this.timeRemainingMonitor = null;
		// Set remaining time to auto continue time
		this.setConfig('timeRemaining', this.getConfig('autoContinueTime'));
	},
	getItemsData: function( callback ){
		if( !this.templateData ){
			var _this = this;

			// Allow other plugins to inject data
			this.getPlayer().triggerQueueCallback( 'relatedData', function( args ){
				// Get data from event
				if( args ){
					_this.templateData = args[0];
					callback();
					return ;
				}
				_this.getDataFromApi( callback );
			});					
			return;
		}
		callback();
		return;
	},
	getDataFromApi: function( callback ){
		var _this = this;
		this.getKalturaClient().doRequest( {
			'service' : 'playlist',
			'action' : 'execute',
			'id' : this.getConfig( 'playlistId' ),
			'filter:objectType': 'KalturaMediaEntryFilterForPlaylist',
			'filter:idNotIn': this.getPlayer().kentryid,
			'filter:limit': this.getConfig('itemsLimit')
		}, function( data ){
			// Check if we got error
			if( data.code && data.message ){
				_this.log('Error getting related items: ' + data.message);
				_this.getBtn().hide();
			}
			var nextItem = data.splice(0,1);
			_this.templateData = {
				nextItem: nextItem[0],
				moreItems: data
			};
			callback();
		});
	},
	getItems: function(){
		return this.getTemplateHTML(this.templateData);
	},
	changeMedia: function( $el, entryId ){
		this.stopTimer();
		// Show title on first click
		if( $el && $el.hasClass('item') && !$el.find('.title').is(':visible') ){
			this.getScreen().find('.item').removeClass('hover');
			$el.addClass('hover');
			return false;
		}

		if( !entryId ){
			entryId = $el.data('entryid');
		}

		var _this = this;
		this.getPlayer().sendNotification('relatedVideoSelect', {entryId: entryId});
		this.getPlayer().sendNotification('changeMedia', {entryId: entryId});
		this.bind('onChangeMediaDone', function(){
			_this.getPlayer().play();
			_this.unbind('onChangeMediaDone');
		})
		this.hide();
	},
	hide: function(){
		this.opened = false;
		this.getScreen().hide();
		if( this.wasPlaying ){
			this.getPlayer().play();
			this.wasPlaying = false;
		}
		this.getPlayer().restoreComponentsHover();
	},
	show: function(){
		this.opened = true;
		this.wasPlaying = this.getPlayer().isPlaying();
		if( this.wasPlaying ) {
			this.getPlayer().pause();
		}
		this.getPlayer().disableComponentsHover();
		this.getScreen().show();
	},
	toggle: function(){
		if( this.opened ){
			this.hide();
		} else {
			this.show();
		}
	},
	onConfigChange: function( property, value ){
		if( property == 'timeRemaining' ){
			var timeFormat = mw.KDPMapping.prototype.formatFunctions.timeFormat;
			this.getScreen().find('.remaining').html(timeFormat(value));
		}
		this._super( property, value );
	},
	getScreen: function(){
		if( ! this.$screen ){
			var _this = this;
			this.$screen = $('<div />')
								.addClass( 'screen ' + this.pluginName )
								.append( 
									$('<div class="screen-content" /> ').append(
										_this.getItems()
									)
								)
								.hide();

			// Should be moved into KBasePlugin
			var $items = this.$screen.find('[data-click],[data-notification]').click(function(e){
				return _this.handleClick( e, $(this) );
			});

			// Add hover events only if device support mouse events
			if( mw.hasMouseEvents() ){
				$items.hover(function(){
					$( this ).addClass('hover');
				},function(){
					$( this ).removeClass('hover');
				});
			}

			this.getPlayer().getVideoHolder().append( this.$screen );
		}
		return this.$screen;
	},
	handleClick: function( e, $el ){

		// TODO: should be moved into KBasePlugin
		e.preventDefault();

		// Always stop timer
		this.stopTimer();

		var data = $el.data();
		// Trigger local callback for data-click property
		if( data.click && $.isFunction(this[data.click]) ){
			this[data.click]( $el );
		}

		if( data.notification ){
			this.getPlayer().sendNotification( data.notification );
		}

		return false;
	},
	getComponent: function() {
		if( !this.$el ) {	
			var _this = this;
			this.$el = $( '<button />' )
						.attr( 'title', 'Related' )
						.addClass( "btn icon-related" + this.getCssClass() )
						.click( function(){
							_this.toggle();
						});
			
		}
		return this.$el;
	}
}));

} )( window.mw, window.jQuery );