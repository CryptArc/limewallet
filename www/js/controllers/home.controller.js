bitwallet_controllers
.controller('HomeCtrl', function(T, Wallet, Scanner, AddressBook, $ionicActionSheet, $scope, $state, $http, $ionicModal, $rootScope, $ionicPopup, $timeout, $location, BitShares, $q, $ionicLoading) {
  
  $scope.$watch('master_key_new', function(newValue, oldValue, scope) {
    if(newValue===oldValue)
      return;
    if($scope && $scope.master_key_new !== undefined && $scope.master_key_new==true)
    {
      $scope.master_key_new = false;
      $state.go('app.account', {first_time:'1'});
      return;
    }
  });
  
  $scope.$on( '$ionicView.beforeEnter', function(){
    if(!$scope || !$scope.wallet || !$scope.wallet.ui)
      return;
    if(!$scope.wallet.ui.balance.allow_hide)
    { 
      $scope.wallet.ui.balance.hidden = false;
      return;
    }
    $scope.wallet.ui.balance.hidden = true;
    
  });
  
  $timeout(function () {
    $scope.wallet.initialized = true;
  }, 2000); 
  
  $scope.toggleBalance = function(){
    if($scope.wallet.ui.balance.allow_hide)
    {
      $scope.wallet.ui.balance.hidden = !$scope.wallet.ui.balance.hidden;
      return;
    }
    if($scope.wallet.ui.balance.hidden)
      $scope.wallet.ui.balance.hidden = false;
  }
  
  $scope.scanQR = function() {
    
    //var uri = 'bts:DVSNKLe7F5E7msNG5RnbdWZ7HDeHoxVrUMZo/transfer/amount/1.1/asset/USD';
    var uri = 'bitcoin://BweMQsJqRdmncwagPiYtANrNbApcRvEV77?amount=0.11';
    Scanner.parseUrl(uri).then(function(data){
      console.log(JSON.stringify(data));
      $scope.resolveURI(data);
    }, function(error){
        console.log(error);
    });
    
    return;           
    
    Scanner.scan().then(function(result) {
      $scope.resolveURI(result);
    }, function(error) {
      window.plugins.toast.show(error, 'long', 'bottom')
    });
  }

  $rootScope.$on('address-book-changed', function(event, data) {
    Wallet.onAddressBookChanged();
  });

  $scope.showLoading = function(text){
    $ionicLoading.show({
      template     : '<i class="icon ion-looping"></i> ' + text,
      animation    : 'fade-in',
      showBackdrop : true,
      maxWidth     : 200,
      showDelay    : 10
    }); 
  }
  
  $scope.showActionSheet = function(tx) {
    var opt_buttons = [
          { text: '<b>'+T.i('home.add_to_book')+'</b>' },
          { text: T.i('home.view_details') }
      ];
    var is_xtx = BitShares.isXtx(tx);
    if(is_xtx){
      if(BitShares.isXtxCompleted(tx))
        opt_buttons = [
          { text: T.i('home.view_details') }];
      else {
        opt_buttons = [
          { text: T.i('home.view_details') },
          { text: T.i('home.requote') },
          { text: T.i('home.refund') },
          { text: '<span class="assertive">'+T.i('home.cancel_operation')+'</span>' },
        ];
      }
    }
    var hideSheet = $ionicActionSheet.show({
     buttons: opt_buttons,
     titleText: T.i('home.transaction_options'),
     cancelText: T.i('g.dismiss'),
     cancel: function() {
          // add cancel code..
     },
     buttonClicked: function(index) {
      if(index==0) {
        if(is_xtx){
          // VIEW DETAILS XTx
          $state.go('app.xtransaction_details', {x_id:tx['x_id']});
        }
        else{
          // Add to addressbook
          $ionicPopup.prompt({
            title: T.i('home.add_to_book'),
            inputType: 'text',
            inputPlaceholder: T.i('home.address_name'),
            cancelText: T.i('g.cancel'),
            okText: T.i('g.save')
          }).then(function(name) {
            if(name === undefined)
              return;
            AddressBook.add(tx.address, name).then(function() {
              Wallet.loadAddressBook().then(function(){
                $rootScope.$emit('address-book-changed');
              });
              window.plugins.toast.show( T.i('home.save_successfull'), 'short', 'bottom');
            });
          });
        }
      }
      
      else if(index==1) {
        if(is_xtx){
          if(BitShares.isBtcPay(tx.tx_type))
          {
            $ionicPopup.alert({
              title    : T.i('err.cant_requote'),
              template : T.i('err.cant_requote_type'),
              okType   : 'button-assertive', 
            });
            return;
          }
          if(!BitShares.isXtxPending(tx))
          {
            $ionicPopup.alert({
              title    : T.i('err.cant_requote'),
              template : T.i('err.cant_requote_status'),
              okType   : 'button-assertive', 
            });
            return;
          }
          // REQUOTE XTx
          $scope.showLoading(T.i('g.cancel_progress'));
          var addy = Wallet.getMainAddress();
          BitShares.getBackendToken(addy).then(function(token) {
            BitShares.cancelXTx(token, tx.x_id).then(function(res){
              $ionicLoading.hide();
              $state.go('app.deposit');
              Wallet.refreshBalance();
              
            }, function(error){
              $ionicLoading.hide();
              console.log('cancel xtx error 1'); console.log(error);
              window.plugins.toast.show( T.i('err.requote_failed'), 'long', 'bottom');
            })
          }, function(error){
            $ionicLoading.hide();
            console.log('cancel xtx error 2'); console.log(error);
            window.plugins.toast.show( T.i('err.requote_failed'), 'long', 'bottom');
          });
        }
        else{
          // View transaction details
          $state.go('app.transaction_details', {tx_id:tx['tx_id']});
        } 
      }
      
      else if(index==2) {
        if(is_xtx){
          // REFUND XTx
          $scope.showLoading(T.i('g.refund_progress'));
          var addy = Wallet.getMainAddress();
          BitShares.getBackendToken(addy).then(function(token) {
            BitShares.refundXTx(token, tx.x_id).then(function(res){
              $ionicLoading.hide();
              console.log('refund ret 1'); console.log(res);
              window.plugins.toast.show( T.i('g.refund_ok'), 'long', 'bottom');
              Wallet.refreshBalance();
            }, function(error){
              $ionicLoading.hide();
              console.log('refund error 1'); console.log(error);
              window.plugins.toast.show( T.i('err.refund_failed'), 'long', 'bottom');
            })
          }, function(error){
            $ionicLoading.hide();
            console.log('refund error 2'); console.log(error);
            window.plugins.toast.show( T.i('err.refund_failed'), 'long', 'bottom');
          });
          
        }
        else{
          // NONE
        } 
      }
      
      else if(index==3) {
        if(is_xtx){
          // CANCEL XTx
          $scope.showLoading(T.i('g.cancel_progress'));
          var addy = Wallet.getMainAddress();
          BitShares.getBackendToken(addy).then(function(token) {
            BitShares.cancelXTx(token, tx.x_id).then(function(res){
              $ionicLoading.hide();
              console.log('cancel xtx ret 1'); console.log(res);
              window.plugins.toast.show( T.i('g.cancel_ok'), 'long', 'bottom');
              Wallet.refreshBalance();
            }, function(error){
              $ionicLoading.hide();
              console.log('cancel xtx error 1'); console.log(error);
              window.plugins.toast.show( T.i('err.cancel_failed'), 'long', 'bottom');
            })
          }, function(error){
            $ionicLoading.hide();
            console.log('cancel xtx error 2'); console.log(error);
            window.plugins.toast.show( T.i('err.cancel_failed'), 'long', 'bottom');
          });
        }
        else{
          // NONE
        } 
      }
      return true;
     }
   });
  }

  $scope.go = function ( path ) {
    console.log('location:'+path);
    $timeout(function () {
      $location.path(path);
    });
  };

  $scope.doRefresh = function() {
    Wallet.refreshBalance()
    .then(function() {
      $scope.$broadcast('scroll.refreshComplete');
      window.plugins.toast.show( T.i('g.updated'), 'short', 'bottom');
    }, function(err) {
      $scope.$broadcast('scroll.refreshComplete');
      window.plugins.toast.show( T.i('g.unable_to_refresh'), 'long', 'bottom');
    });
  };
  
  $scope.loadMore = function() {
    //$scope.$broadcast('scroll.infiniteScrollComplete');
    return;
  };
  
  $scope.$on('$stateChangeSuccess', function() {
    //return;
    $scope.loadMore();
  });
  
  $scope.moreDataCanBeLoaded = function() {
    return false;
  };
  
});

