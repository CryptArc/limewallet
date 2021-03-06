var bitwallet_filters = angular.module('bit_wallet.filters', ['bit_wallet.config']);

var moments       = ['0_today', '1_this_week', '2_this_month'];
var current_year  = moment().year().toString();
bitwallet_filters.filter('moment_separator', function(T) {
  return function(box_label) {
  //console.log(box_label);
    var m_box_label = box_label.toString();
    if(moments.indexOf(m_box_label)>-1)
      return T.i('home.'+m_box_label);
    var my_moment = moment(m_box_label, 'YYYY-MM');
    return ((m_box_label.indexOf(current_year)>-1)?my_moment.format('MMMM'):my_moment.format('MMMM YYYY'));
  }
});


bitwallet_filters.filter('from_now', function(T) {
  return function(tx) {
    if(tx===undefined)
      return '';
    return moment(tx.TS).fromNow();
  }
});

bitwallet_filters.filter('xtx_status', function(T) {
  return function(xtx) {
    if(xtx===undefined)
      return '';
    var simple_translation  = T.i('xchg.'+xtx.status);
    var full_t              = 'xchg.'+xtx.status+'_full';
    var full_translation    = T.i(full_t);
    if(simple_translation!=full_translation && full_translation!=full_t)
    {
      return simple_translation + ' (' + full_translation + ')';
    }
    return simple_translation;
  }
});

bitwallet_filters.filter('capitalize', function() {
  return function (input, format) {
      if (!input) {
        return input;
      }
      format = format || 'first';
      if (format === 'first') {
        // Capitalize the first letter of a sentence
        return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
      } else {
        var words = input.split(' ');
        var result = [];
        words.forEach(function(word) {
          if (word.length === 2 && format === 'team') {
            // Uppercase team abbreviations like FC, CD, SD
            result.push(word.toUpperCase());
          } else {
            result.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
          }
        });
        return result.join(' ');
      }
    };
});
  
bitwallet_filters.filter('xtx_action', function(BitShares, $filter, T) {
  return function(xtx) {
    if(xtx===undefined)
      return 'xtx is undefined';
    var to_translate = xtx.tx_type;
    if(to_translate=='withdraw')
      to_translate = 'withdrew';
    return T.i('g.'+to_translate);
  }
});

bitwallet_filters.filter('is_uncompleted_xtx', function(BitShares, $filter) {
  return function(xtx) {
    if(!xtx)
      return false;
    if (!BitShares.isXtx(xtx))
      return false;
    return !BitShares.isXtxCompleted(xtx);
  }
});

bitwallet_filters.filter('bitshares_tx_id', function(BitShares, $filter) {
  return function(tx) {
    if(!tx)
      return '';
    if(BitShares.isDeposit(tx))
      return tx.cl_recv_tx?tx.cl_recv_tx:'N/A';
    return tx.cl_pay_tx?tx.cl_pay_tx:'N/A';
  }
});

bitwallet_filters.filter('bitcoin_tx_id', function(BitShares, $filter) {
  return function(tx) {
    if(!tx)
      return '';
    if(!BitShares.isDeposit(tx))
      return tx.cl_recv_tx?tx.cl_recv_tx:'N/A';
    return tx.cl_pay_tx?tx.cl_pay_tx:'N/A';
  }
});

bitwallet_filters.filter('draw_op_amount', function(BitShares, $filter) {
  return function(op, precision, decimals) {
    decimals = decimals || 2;
    return $filter('number')(parseFloat(op.amount)/precision, decimals);
  }
});

bitwallet_filters.filter('get_tx_status', function(BitShares, $filter) {
  return function(tx) {
    if (['RR', 'RF', 'XX'].indexOf(tx.status)>=0)
    return '_gray';
  if ('WP'==tx.status)
    return '_waiting';
  if ('RC'==tx.status)
    return '_rate_changed';
  if($filter('is_uncompleted_xtx')(tx))
    return '_waiting';  
  return '';
  }
});

bitwallet_filters.filter('tx_icon_src', function(BitShares, $filter) {
  return function(tx) {
    if(!tx)
      return '';
    if(BitShares.isDeposit(tx))
      return 'img/icons/ico-deposit'+ $filter('get_tx_status')(tx) +'.svg';
    if(BitShares.isWithdraw(tx)) 
      return 'img/icons/ico-withdraw'+ $filter('get_tx_status')(tx) +'.svg';
    if(BitShares.isBtcPay(tx))
      return 'img/icons/ico-btc_pay'+ $filter('get_tx_status')(tx) +'.svg';
    if(tx.ui_type=='sent')
      return 'img/icons/ico-sent.svg';
    if(tx.ui_type=='received')
      return 'img/icons/ico-received.svg';
    if(tx.ui_type=='self')
      return 'img/icons/ico-received.svg';
    return '';
  }
});

bitwallet_filters.filter('xtx_btc_amount', function(BitShares, Wallet, $filter) {
  return function(tx) {
    if(!tx)
      return '';

    var amount = $filter('draw_tx_btc_amount')(tx);

    return amount + ' BTC';
  }
});
bitwallet_filters.filter('draw_tx_btc_amount', function(BitShares, Wallet, $filter) {
  return function(tx) {
    if(!tx)
      return '';

    if(BitShares.isWithdraw(tx) || BitShares.isBtcPay(tx))
      return $filter('currency')(tx.cl_recv, tx.cl_recv_curr);

    if(BitShares.isDeposit(tx))
      return $filter('currency')(tx.cl_pay, tx.cl_pay_curr);
    
    return '';
  }
});


bitwallet_filters.filter('xtx_amount', function(BitShares, Wallet, $filter) {
  return function(tx) {
    if(!tx)
      return '';

    var amount = $filter('draw_tx_amount')(tx);

    if(Wallet.data.asset.symbol == 'BTC') 
      return amount + ' ' + Wallet.data.asset.symbol_ui_text;

    return Wallet.data.asset.symbol_ui_text + ' ' + amount;
  }
});

bitwallet_filters.filter('draw_tx_amount', function(BitShares, Wallet, $filter) {
  return function(tx) {
    if(!tx)
      return '';

    if(BitShares.isDeposit(tx))
      return $filter('currency')(tx.cl_recv, tx.cl_recv_curr);

    if(BitShares.isWithdraw(tx) || BitShares.isBtcPay(tx))
      return $filter('currency')(tx.cl_pay, tx.cl_pay_curr);
    
    return $filter('currency')(tx.amount, Wallet.data.asset.name);
  }
});

bitwallet_filters.filter('book2rate', function() {
  return function(book) {
    if(!book) return '';
    return book.split('/').reverse().join('/');
  }
});

bitwallet_filters.filter('currency', function($filter) {
  return function(val, curr) {
    if(!curr) return $filter('number')(val, 2);
    
    //Its a book (precision of the QUOTE currency)
    if(curr.indexOf('/') != -1) curr = curr.split('/')[1];

    if(curr == 'bitUSD' || curr == 'USD') { 
      return $filter('number')(val, 2);
    }

    if(curr == 'bitCNY' || curr == 'CNY') {
      return $filter('number')(val, 2);
    }

    if(curr == 'bitBTC' || curr == 'BTC') {
      return $filter('number')(val, 8);
    }

    return $filter('number')(val, 4);
  }
});



// angular.module('phonecatFilters', []).filter('checkmark', function() {
  // return function(input) {
    // return input ? '\u2713' : '\u2718';
  // };
// });
