bitwallet_controllers
.controller('HomeCtrl', function(T, Wallet, Scanner, AddressBook, $ionicActionSheet, $scope, $state, $http, $ionicModal, $rootScope, $ionicPopup, $timeout, $location, BitShares, $q) {
  
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
           
    Scanner.scan()
    .then(function(result) {
      if( !result.cancelled ) {

        if(result.privkey !== undefined)
        {
          $state.go('app.import_priv', {private_key:result.privkey});
          return;
        }
        
        var promises = [];
        //Pubkey scanned
        if(result.pubkey !== undefined) {
          //result.address = bitcoin.bts.pub_to_address(bitcoin.bts.decode_pubkey(result.pubkey));
          var p = BitShares.btsPubToAddress(result.pubkey)
          .then(function(addy){
            result.address = addy;
          })
          promises.push(p);
        }
        $q.all(promises).then(function() {
          $state.go('app.send', {address:result.address, amount:result.amount, asset_id:result.asset_id});
        })
      }
    }, function(error) {
      
      window.plugins.toast.show(error, 'long', 'bottom')
    });
  }

  $rootScope.$on('address-book-changed', function(event, data) {
    Wallet.onAddressBookChanged();
  });

  $scope.showActionSheet = function(tx) {
    var opt_buttons = [
          { text: '<b>'+T.i('home.add_to_book')+'</b>' },
          { text: T.i('home.view_details') }
      ];
    var is_xtx = BitShares.isXtx(tx);
    if(is_xtx){
      opt_buttons = [
          { text: '<span class="assertive">'+T.i('home.cancel_operation')+'</span>' },
          { text: T.i('home.refund') },
          { text: T.i('home.view_details') }
        ];
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
          // CANCEL XTx
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
          // REFUND XTx
        }
        else{
          // View transaction details
          $state.go('app.transaction_details', {tx_id:tx['tx_id']});
        } 
      }
      
      else if(index==2) {
        if(is_xtx){
          $state.go('app.xtransaction_details', {x_id:tx['x_id']});
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

