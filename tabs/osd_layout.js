'use strict';


var FONT = FONT || {};

FONT.initData = function() {
    if (FONT.data) {
        return;
    }
    FONT.data = {
            // default font file name
            loaded_font_file: 'default',
            // array of arry of image bytes ready to upload to fc
            characters_bytes: [],
            // array of array of image bits by character
            characters: [],
            // an array of base64 encoded image strings by character
            character_image_urls: []
    }
};

FONT.constants = {
        SIZES: {
            /** NVM ram size for one font char, actual character bytes **/
            MAX_NVM_FONT_CHAR_SIZE: 54,
            /** NVM ram field size for one font char, last 10 bytes dont matter **/
            MAX_NVM_FONT_CHAR_FIELD_SIZE: 64,
            CHAR_HEIGHT: 18,
            CHAR_WIDTH: 12
        },
        COLORS: {
            // black
            0: 'rgba(0, 0, 0, 1)',
            // also the value 3, could yield transparent according to
            // https://www.sparkfun.com/datasheets/BreakoutBoards/MAX7456.pdf
            1: 'rgba(255, 255, 255, 0)',
            // white
            2: 'rgba(255,255,255, 1)'
        }
};

FONT.blocks = {
        logo: {
            data: [1,2,3,17,18,19],
            width: 3
        }
};

/**
 * Each line is composed of 8 ascii 1 or 0, representing 1 bit each for a total of 1 byte per line
 */
FONT.parseMCMFontFile = function(data) {
    var data = data.split("\n");
    // clear local data
    FONT.data.characters.length = 0;
    FONT.data.characters_bytes.length = 0;
    FONT.data.character_image_urls.length = 0;
    // make sure the font file is valid
    if (data.shift().trim() != 'MAX7456') {
        var msg = 'that font file doesnt have the MAX7456 header, giving up';
        console.debug(msg);
        Promise.reject(msg);
    }
    var character_bits = [];
    var character_bytes = [];
    // hexstring is for debugging
    FONT.data.hexstring = [];
    for (var i = 0; i < data.length; i++) {
        var line = data[i];
        // hexstring is for debugging
        FONT.data.hexstring.push('0x' + parseInt(line, 2).toString(16));
        // every 64 bytes (line) is a char, we're counting chars though, which are 2 bits
        if (character_bits.length == FONT.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE * (8 / 2)) {
            FONT.data.characters_bytes.push(character_bytes);
            FONT.data.characters.push(character_bits);
            FONT.draw(FONT.data.characters.length-1);
            //$log.debug('parsed char ', i, ' as ', character);
            character_bits = [];
            character_bytes = [];
        }
        for (var y = 0; y < 8; y = y + 2) {
            var v = parseInt(line.slice(y, y+2), 2);
            character_bits.push(v);
        }
        character_bytes.push(parseInt(line, 2));
    }
    FONT.drawBlock(FONT.blocks.logo);
    return FONT.data.characters;
};


FONT.openFontFile = function($preview) {
    chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{extensions: ['mcm']}]}, function (fileEntry) {
        FONT.data.loaded_font_file = fileEntry.name;
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
        }
        fileEntry.file(function (file) {
            var reader = new FileReader();
            reader.onloadend = function(e) {
                if (e.total != 0 && e.total == e.loaded) {
                    FONT.parseMCMFontFile(e.target.result);
                    if ($preview) {
                        FONT.preview($preview);
                    }
                }
                var msg = 'could not load whole font file';
                console.error(msg);
            };
            reader.readAsText(file);
        });
    });
};

/**
 * returns a canvas image with the character on it
 */
var drawCanvas = function(charAddresses, block_width) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext("2d");

    // TODO: do we want to be able to set pixel size? going to try letting the consumer scale the image.
    var pixelSize = pixelSize || 1;
    var width = pixelSize * FONT.constants.SIZES.CHAR_WIDTH;
    var height = pixelSize * FONT.constants.SIZES.CHAR_HEIGHT;

    canvas.width = width;
    canvas.height = height;

    if (charAddresses.length != undefined) {
        canvas.width *= block_width;
        canvas.height *= (charAddresses.length / block_width);
    }

    var offsetX = 0;
    var offsetY = 0;

    function process(charAddress) {
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var v = FONT.data.characters[charAddress][(y*width)+x];
                ctx.fillStyle = FONT.constants.COLORS[v];
                ctx.fillRect(x + offsetX, y + offsetY, pixelSize, pixelSize);
            }
        }
    }

    if (charAddresses.length != undefined) {
        charAddresses.forEach(function(charAddress) {
            process(charAddress);
            offsetX += width;
            if (offsetX >= (block_width * width)) {
                offsetX = 0;
                offsetY += height;
            }
        });
    } else {
        process(charAddresses);
    }
    return canvas;
};

FONT.draw = function(charAddress) {
    var cached = FONT.data.character_image_urls[charAddress];
    if (!cached) {
        cached = FONT.data.character_image_urls[charAddress] = drawCanvas(charAddress, 1).toDataURL('image/png');
    }
    return cached;
};

FONT.drawBlock = function(block) {
    var charAddresses = block.data;
    var width = block.width;
    var cached = FONT.data.character_image_urls[block];
    if (!cached) {
        cached = FONT.data.character_image_urls[block] = drawCanvas(charAddresses, width).toDataURL('image/png');
    }
    return cached;
};
/*
FONT.msp = {
  encode: function(charAddress) {
    return [charAddress].concat(FONT.data.characters_bytes[charAddress].slice(0,FONT.constants.SIZES.MAX_NVM_FONT_CHAR_SIZE));
  }
};

FONT.upload = function($progress) {
  return Promise.mapSeries(FONT.data.characters, function(data, i) {
    $progress.val((i / FONT.data.characters.length) * 100);
    return MSP.promise(MSP_codes.MSP_OSD_CHAR_WRITE, FONT.msp.encode(i));
  })
  .then(function() {
    return MSP.promise(MSP_codes.MSP_SET_REBOOT);
  });
};
 */
FONT.preview = function($el) {
    $el.empty();
    FONT.data.character_image_urls.map(function(url) {
        $el.append('<img src='+url+'></img>');
    });
}

FONT.preview2 = function($el) {
    for (var i = 0; i < FONT.data.character_image_urls.length; i++) {
        if (i % 16 == 0 && i > 0)
            $el.append('</div>');
        if (i % 16 == 0)
            $el.append('<div class="font_text_row">');
        var url = FONT.data.character_image_urls[i];
        $el.append('<img src='+url+'></img>');
    }
    $el.append('</div>');
}

FONT.logo = function($el) {
    var url = FONT.data.character_image_urls[FONT.blocks.logo];
    $el.append('<img src=' + url + '></img>');
    $el.height(FONT.constants.SIZES.CHAR_HEIGHT * (FONT.blocks.logo.data.length / FONT.blocks.logo.width));
}

FONT.write = function($el, text) {
    if (text == undefined)
        return;
    for (var i = 0; i < text.length; i++) {
        var url = FONT.data.character_image_urls[text.charCodeAt(i)];
        $el.append('<img src=' + url + '></img>');
    }
    $el.height(FONT.constants.SIZES.CHAR_HEIGHT);
}

OSD.constants = {
    ELEMENT_DEFAULTS: [
        // durations
        {
            id: 1,
            name: 'onDuration',
            example_value: '00:00' 
        },
        {
            id: 2,
            name: 'armedDuration',
            example_value: '00:00' 
        },
        
        // current
        {
            id: 3,
            name: 'mahDrawn',
            example_value: 'MAH:  1337' 
        },
        {
            id: 4,
            name: 'amperage',
            example_value: 'AMP: 0.30A' 
        },
        
        // voltage
        {
            id: 6,
            name: 'voltage5V',
            example_value: '5V:  0.1V' 
        },
        {
            id: 7,
            name: 'voltage12V',
            example_value: '12V: 12.5V' 
        },
        {
            id: 8,
            name: 'voltageBattery',
            example_value: 'BAT: 16.8V' 
        },
        {
            id: 9,
            name: 'voltageBatteryFC',
            example_value: 'FC: 16.8V' 
        },
        
        // modes
        {
            id: 10,
            name: 'flightMode',
            example_value: 'HRZN' 
        },
        {
            id: 11,
            name: 'indicatorMag',
            example_value: 'M' 
        },
        {
            id: 12,
            name: 'indicatorBaro',
            example_value: 'B' 
        },
        
        // rx
        {
            id: 13,
            name: 'rssiFC',
            example_value: 'RSSI:100' 
        },
        
        // pilot
        {
            id: 14,
            name: 'callsign',
            example_value: ' CLEANFLIGHT! ' 
        },
        
    ],
};

TABS.osd_layout = {};
TABS.osd_layout.initialize = function (callback) {
    var self = this;
    var ui_fields = [];
    var video_mode = 0;

    var callsign_supported = semver.gte(CONFIG.apiVersion, "1.22.0");
    
    if (GUI.active_tab != 'osd_layout') {
        GUI.active_tab = 'osd_layout';
        googleAnalytics.sendAppView('OSD');
    }

    MSP.send_message(MSP_codes.MSP_OSD_VIDEO_STATUS, false, false, load_pilot);
    
    function load_pilot() {
        var next_callback = load_element_summary;
        if (callsign_supported) {
            MSP.send_message(MSP_codes.MSP_PILOT, false, false, next_callback);
        } else {
            next_callback();
        }
    }
    
    function load_element_summary() {
        MSP.send_message(MSP_codes.MSP_OSD_ELEMENT_SUMMARY, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/osd_layout.html", process_html);
    }
    
    function process_html() {

        // translate to user-selected language
        localize();
        
        if (!callsign_supported) {
            $('.callsign_wrapper').hide();
        } else {
            $(".callsign").val(PILOT_CONFIG.callsign);
        }

        function on_save_handler() {
            var elements = [];
            
            var $ui_fields = $('.tab-osd-layout .display-fields .checkbox input');
            
            $ui_fields.each( function(index, $ui_field) {
                var ui_field = $($ui_field).data('field');
                
                var yy = ui_field.vertical_alignment == 'top' ? ui_field.position_y : 0 - (OSD_VIDEO_STATE.text_height - ui_field.position_y);
                var flag_mask = ui_field.element.initial_flag_mask;
                // unset the bits we might allow changes to.
                flag_mask = bit_clear(flag_mask, 0); // clear enabled;
                
                // update the bits as the user requires.
                if (ui_field.enabled) {
                    flag_mask = bit_set(flag_mask, 0);
                }
                
                var element = {
                    id: ui_field.element.id,
                    flag_mask: flag_mask,
                    x: ui_field.position_x,
                    y: yy,
                };
                elements.push(element);
            });
            
            MSP.sendOsdLayout(elements, save_pilot);

            function save_pilot() {
                var next_callback = save_to_eeprom;
                if (callsign_supported) {
                    var callsign = $(".callsign").val();
                    
                    var buffer = [];
                    buffer.push(callsign.length);
                    
                    for (let i = 0; i < 14; i++) {
                        buffer.push(callsign.charCodeAt(i));
                    }
                    
                    MSP.send_message(MSP_codes.MSP_SET_PILOT, buffer, false, next_callback);
                } else {
                    next_callback();
                } 
            }
            
            function save_to_eeprom() {
                MSP.send_message(MSP_codes.MSP_EEPROM_WRITE, false, false, function() {
                    GUI.log(chrome.i18n.getMessage('osdLayoutEepromSaved'));
                });
            }
        }

        //  init structs once, also clears current font
        var $preview = $('.font-preview');
        $preview.empty();

        FONT.initData();
        $.get('/resources/osd/cleanflight-font.mcm', function(data) {
            FONT.parseMCMFontFile(data);
            // FONT.preview($preview);
            // FONT.logo($preview);
            // FONT.preview2($preview);
        });

        $('a.save').click(on_save_handler);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSP_codes.MSP_STATUS);
            MSP.send_message(MSP_codes.MSP_OSD_VIDEO_STATUS, false, false, check_video_mode);
        }, 250, true);

        load_elements();
        
        GUI.content_ready(callback);
    }

    function load_elements() {
        MSP.send_message(MSP_codes.MSP_OSD_LAYOUT_CONFIG, false, false, refresh_element_display);
    }

    function refresh_element_display() {

        // store the initial video mode used to render the preview so that changes can be detected.
        video_mode = OSD_VIDEO_STATE.video_mode;
        
        var $canvas = $('.tab-osd-layout .osd_canvas');
        $($canvas).height(FONT.constants.SIZES.CHAR_HEIGHT * OSD_VIDEO_STATE.text_height);

        // display fields on/off and position
        var $displayFields = $('.display-fields').empty();
        ui_fields = [];

        FONT.initData();

        for (let element of OSD_LAYOUT.elements) {
        
            var element_defaults = find_element_defaults(element.id);
            if (!element_defaults) {
                continue;
            }

            var text_key = 'osdElement_' + element_defaults.name;
            
            var vertical_alignment = element.y >= 0 ? 'top' : 'bottom';
            
            var y = vertical_alignment == 'top' ? element.y : OSD_VIDEO_STATE.text_height + element.y;
            
            var ui_field = {
                name: element_defaults.name,
                text: chrome.i18n.getMessage(text_key),
                position_x: element.x,
                position_y: y,
                positionable: element.positionable,
                example_value: element_defaults.example_value,
                enabled: element.enabled,
                element: element,
                vertical_alignment: vertical_alignment,
            };

            ui_fields.push(ui_field);
        
        
            var checked = (ui_field.enabled) ? 'checked' : '';
            var $field1 = $('<div class="elementselect" />');
            var $field2 = $('<div class="checkbox" />');
            var $field = $('<div class="numberspacer" />');
            $field.append(
                    $('<input type="checkbox" class="togglesmall" name="' + ui_field.name + '" ' + 
                            checked + '></input>')
                            .data('field', ui_field)
                            .change(function(e) {
                                var ui_field = $(this).data('field');
                                ui_field.enabled = !ui_field.enabled;
                                if (ui_field.enabled)
                                    $('.osd_canvas').find('.block_' + ui_field.name).removeClass('hide_block');
                                else
                                    $('.osd_canvas').find('.block_' + ui_field.name).addClass('hide_block');
                            })
            );
            $field2.append($field);
            $field2.append('<label for="' + ui_field.name + '">' + ui_field.text + '</label>');

            $field1.append($field2);



            $field1
                .mouseenter(function(e) {
                    var fieldName = $(this).find('.checkbox input').data('field').name;
                    $('.osd_canvas').find('.block_' + fieldName).addClass('block_active');
                })
                .mouseleave(function(e) {
                    var fieldName = $(this).find('.checkbox input').data('field').name
                    $('.osd_canvas').find('.block_' + fieldName).removeClass('block_active');
                });

            $displayFields.append($field1);
        }

        UpdateAllBlocks();
        
        GUI.apply_toggles();
    }
    
    function find_element_defaults(element_id) {
        for (let candidate of OSD.constants.ELEMENT_DEFAULTS) {
            if (candidate.id == element_id) {
                return candidate;
            }
        }
        return null;
    }
    
    function UpdateAllBlocks() 
    {
        var $canvas = $('.osd_canvas').empty();
        $.get('/resources/osd/cleanflight-font.mcm', function(data) {
            FONT.parseMCMFontFile(data);
            for (let ui_field of ui_fields) {
                UpdateBlock(ui_field);
            }
        });
    }

    function UpdateBlock(ui_field) 
    {
        var $canvas = $('.osd_canvas');

        var $block = $('<div class="font_text_row block_' + ui_field.name + '" />');
        $canvas.append($block);
        if (ui_field.example_value == "FONT.logo") {
            FONT.logo($block);
        } else {
            FONT.write($block, ui_field.example_value);
        }

        $block.draggable();
        $block.draggable("option", "grid", [ FONT.constants.SIZES.CHAR_WIDTH, FONT.constants.SIZES.CHAR_HEIGHT ]);
        $block.draggable({containment: "parent"});
        $block.bind('drag', function() {
            ui_field.position_y = ($block.offset().top - $canvas.offset().top) / FONT.constants.SIZES.CHAR_HEIGHT;
            ui_field.position_x = ($block.offset().left - $canvas.offset().left) / FONT.constants.SIZES.CHAR_WIDTH;
        });
        if (!ui_field.enabled) {
            $block.addClass('hide_block');
        }
        $block.offset({ 
            top: $canvas.offset().top + ui_field.position_y * FONT.constants.SIZES.CHAR_HEIGHT, 
            left: $canvas.offset().left + ui_field.position_x * FONT.constants.SIZES.CHAR_WIDTH
        });
    }
    
    function check_video_mode() {
        if (video_mode != OSD_VIDEO_STATE.video_mode) {
            refresh_element_display();
        }
    }
};

TABS.osd_layout.cleanup = function (callback) {
    PortHandler.flush_callbacks();

    // unbind "global" events
    $(document).unbind('keypress');
    $(document).off('click', 'span.progressLabel a');

    if (callback) callback();
};
